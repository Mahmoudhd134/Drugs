using ClinicHub.Domain.Identity;

namespace ClinicHub.Application.Features.Identity.Users;

/// <summary>Startup seeding of users (idempotent, every start; called by Infrastructure's <c>StartupSeeder</c>).</summary>
public interface IIdentitySeeder
{
    /// <summary>
    /// Every phone in <c>Platform:SuperAdminPhones</c> gets a user (<see cref="IUserAccounts"/>) with
    /// <see cref="User.IsSuperAdmin"/>; any other user loses the flag, and their sessions are revoked (they may be
    /// in a super-admin context). An invalid phone is a startup error.
    /// </summary>
    Task SeedSuperAdminsAsync(CancellationToken cancellationToken = default);
}
