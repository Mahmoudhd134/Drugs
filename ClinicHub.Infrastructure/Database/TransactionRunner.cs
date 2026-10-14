using ClinicHub.Application.Common.Abstractions;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Storage;

namespace ClinicHub.Infrastructure.Database;

/// <inheritdoc />
public sealed class TransactionRunner(AppDbContext db) : ITransactionRunner
{
    public async Task<T> RunAsync<T>(Func<CancellationToken, Task<T>> work, Func<T, bool> commit,
        CancellationToken cancellationToken = default)
    {
        if (db.Database.CurrentTransaction is { } current)
            return await JoinAsync(current, work, commit, cancellationToken);

        // The strategy reruns the whole unit on a transient failure (when retries are enabled), so
        // every attempt starts from a clean change tracker
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
}
