using ClinicHub.Application.Features.Identity;
using ClinicHub.Infrastructure.Database;
using Microsoft.EntityFrameworkCore;

namespace ClinicHub.Infrastructure.Identity;

/// <summary><see cref="IOtpLock"/> as <c>pg_advisory_xact_lock(hashtext(phone))</c>: released by the commit or rollback.</summary>
public sealed class OtpLock(AppDbContext db) : IOtpLock
{
    public async Task AcquireAsync(string phone, CancellationToken cancellationToken = default)
    {
        // Outside a transaction the lock would end with the statement and serialize nothing
        if (db.Database.CurrentTransaction is null)
            throw new InvalidOperationException("The OTP lock must be taken inside a transaction (send a command).");
        await db.Database.ExecuteSqlInterpolatedAsync($"SELECT pg_advisory_xact_lock(hashtext({phone}))", cancellationToken);
    }
}
