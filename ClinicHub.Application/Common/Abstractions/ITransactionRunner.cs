namespace ClinicHub.Application.Common.Abstractions;

/// <summary>
/// Runs work in one database transaction. Implemented in Infrastructure with the EF execution
/// strategy, so a retried attempt reruns the whole unit. Used by the <c>TransactionBehavior</c>.
/// </summary>
public interface ITransactionRunner
{
    /// <summary>
    /// Runs <paramref name="work"/> in a transaction and commits only when <paramref name="commit"/>
    /// returns true for its result; otherwise, or on an exception, everything it wrote is rolled back.
    /// Inside an existing transaction it joins it through a savepoint instead of nesting: a failure
    /// rolls back to the savepoint, and the outer transaction decides the commit.
    /// </summary>
    Task<T> RunAsync<T>(Func<CancellationToken, Task<T>> work, Func<T, bool> commit,
        CancellationToken cancellationToken = default);
}
