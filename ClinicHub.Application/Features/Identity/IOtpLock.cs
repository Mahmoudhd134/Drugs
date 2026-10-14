namespace ClinicHub.Application.Features.Identity;

/// <summary>
/// Serializes code requests for one phone, so parallel calls can't slip past the limits (implemented in
/// Infrastructure with a PostgreSQL transaction-level advisory lock).
/// </summary>
public interface IOtpLock
{
    /// <summary>Waits for the phone's lock, held until the current transaction ends. Throws outside a transaction.</summary>
    Task AcquireAsync(string phone, CancellationToken cancellationToken = default);
}
