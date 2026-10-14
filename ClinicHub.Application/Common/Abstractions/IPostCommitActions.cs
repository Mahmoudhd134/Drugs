namespace ClinicHub.Application.Common.Abstractions;

/// <summary>
/// Side effects that must wait for the database (scoped per request; implemented by Infrastructure's
/// <c>TransactionRunner</c>), e.g. clearing an access cache entry: done inside the transaction, a concurrent
/// request could reload the old, not yet committed rows and cache them again.
/// </summary>
public interface IPostCommitActions
{
    /// <summary>
    /// Inside a transaction opened by <see cref="ITransactionRunner"/> (a command), queues
    /// <paramref name="action"/> to run when the <b>outermost</b> one ends, committed or rolled back, after
    /// the execution strategy finished (retries included); nested commands only queue. Outside one, runs it
    /// at once. A failing action is logged, never thrown. Actions get no request token: they run even when
    /// the request was cancelled (the commit may have happened). Use only for actions that are safe after a
    /// rollback too (clearing a cache entry is: worst case one extra reload).
    /// </summary>
    Task AddAsync(Func<CancellationToken, Task> action);
}
