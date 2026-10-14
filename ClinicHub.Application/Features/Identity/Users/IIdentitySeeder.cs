using ClinicHub.Domain.Identity;

namespace ClinicHub.Application.Features.Identity.Users;

/// <summary>Startup seeding of users (idempotent, every start; called by Infrastructure's <c>StartupSeeder</c>).</summary>
public interface IIdentitySeeder
{
    /// <summary>
    /// Every phone in <c>Platform:SuperAdminPhones</c> gets a user with <see cref="User.IsSuperAdmin"/>;
    /// any other user loses the flag, and their sessions are revoked (they may be in a super-admin context).
    /// </summary>
    Task SeedSuperAdminsAsync(CancellationToken cancellationToken = default);

    /// <summary>Finds or creates the user of a phone from configuration (invalid → startup error).</summary>
    Task<User> EnsureUserAsync(string phone, string setting, CancellationToken cancellationToken = default);
}
