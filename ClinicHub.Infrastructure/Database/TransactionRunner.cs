using ClinicHub.Application.Common.Abstractions;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Storage;
using Microsoft.Extensions.Logging;

namespace ClinicHub.Infrastructure.Database;

/// <summary>
/// Scoped (one per request). Also the <see cref="IPostCommitActions"/> queue: only the runner knows when
/// the outermost transaction it opened has ended.
/// </summary>
public sealed class TransactionRunner(AppDbContext db, ILogger<TransactionRunner> logger)
    : ITransactionRunner, IPostCommitActions
{
    private readonly List<Func<CancellationToken, Task>> postCommit = [];

    /// <summary>True while the outermost transaction opened by this runner is open (scoped: one request, not thread safe).</summary>
    private bool inOwnTransaction;

    public async Task<T> RunAsync<T>(Func<CancellationToken, Task<T>> work, Func<T, bool> commit,
        CancellationToken cancellationToken = default)
    {
        if (db.Database.CurrentTransaction is { } current)
            return await JoinAsync(current, work, commit, cancellationToken);

        inOwnTransaction = true;
        try
        {
            return await RunOutermostAsync(work, commit, cancellationToken);
        }
        finally
        {
            // Committed, rolled back or thrown, after the execution strategy is done (retries included)
            inOwnTransaction = false;
            await RunPostCommitAsync();
        }
    }

    public async Task AddAsync(Func<CancellationToken, Task> action)
    {
        ArgumentNullException.ThrowIfNull(action);
        if (inOwnTransaction)
            postCommit.Add(action);
        else
            // No transaction of ours (none at all, or one opened elsewhere, e.g. the dev seed): now
            await RunSafelyAsync(action);
    }

    private async Task<T> RunOutermostAsync<T>(Func<CancellationToken, Task<T>> work, Func<T, bool> commit,
        CancellationToken cancellationToken)
    {
        // The strategy reruns the whole unit on a transient failure (when retries are enabled), so
        // every attempt starts from a clean change tracker. Actions queued by a failed attempt stay
        // queued: running them is harmless (see IPostCommitActions)
        var attempt = 0;
        return await db.Database.CreateExecutionStrategy().ExecuteAsync(async token =>
        {
            if (attempt++ > 0)
                db.ChangeTracker.Clear();

            await using var transaction = await db.Database.BeginTransactionAsync(token);
            var result = await work(token);
            if (commit(result))
            {
                await transaction.CommitAsync(token);
            }
            else
            {
                await transaction.RollbackAsync(token);
                // What was "saved" is gone: later saves in this scope must not build on it
                db.ChangeTracker.Clear();
            }
            return result;
        }, cancellationToken);
    }

    /// <summary>
    /// Inside an outer transaction: a savepoint, released on success and rolled back to on failure. The
    /// change tracker is not cleared here (it also holds the outer unit's entities), so rows the inner unit
    /// saved stay tracked as saved: an outer handler must not reuse them after an inner failure.
    /// </summary>
    private static async Task<T> JoinAsync<T>(IDbContextTransaction transaction,
        Func<CancellationToken, Task<T>> work, Func<T, bool> commit, CancellationToken cancellationToken)
    {
        var savepoint = $"command_{Guid.NewGuid():N}";
        await transaction.CreateSavepointAsync(savepoint, cancellationToken);
        T result;
        try
        {
            result = await work(cancellationToken);
        }
        catch
        {
            // Best effort: if the connection is broken, the original exception is the one to report
            try
            {
                await transaction.RollbackToSavepointAsync(savepoint, CancellationToken.None);
            }
            catch
            {
                // The outer transaction fails with it anyway
            }
            throw;
        }

        if (commit(result))
            await transaction.ReleaseSavepointAsync(savepoint, cancellationToken);
        else
            await transaction.RollbackToSavepointAsync(savepoint, cancellationToken);
        return result;
    }

    private async Task RunPostCommitAsync()
    {
        var actions = postCommit.ToList();
        postCommit.Clear();
        foreach (var action in actions)
            await RunSafelyAsync(action);
    }

    private async Task RunSafelyAsync(Func<CancellationToken, Task> action)
    {
        try
        {
            await action(CancellationToken.None);
        }
        catch (Exception exception)
        {
            logger.LogError(exception, "A post-commit action failed");
        }
    }
}
