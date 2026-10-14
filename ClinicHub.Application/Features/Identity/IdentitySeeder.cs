using ClinicHub.Application.Common.Abstractions;
using ClinicHub.Application.Common.Settings;
using ClinicHub.Application.Features.Access;
using ClinicHub.Domain.Identity;
using Microsoft.EntityFrameworkCore;

namespace ClinicHub.Application.Features.Identity;

/// <summary>
/// Startup seeding of users (idempotent, every start; called by Infrastructure's <c>StartupSeeder</c>). A
/// service, not a use case: it runs before the app serves requests, on <see cref="IAppDbContext"/> and
/// <see cref="ITransactionRunner"/> only.
/// </summary>
public sealed class IdentitySeeder(
    IAppDbContext db,
    ITransactionRunner transactions,
    IAccessCache accessCache,
    PlatformSettings platform)
{
    /// <summary>
    /// Every phone in <c>Platform:SuperAdminPhones</c> gets a user with <see cref="User.IsSuperAdmin"/>;
    /// any other user loses the flag, and their sessions are revoked (they may be in a super-admin context).
    /// </summary>
    public async Task SeedSuperAdminsAsync(CancellationToken cancellationToken = default)
    {
        var phones = platform.SuperAdminPhones
            .Where(p => !string.IsNullOrWhiteSpace(p))
            .Select(p => NormalizeConfigPhone(p, "Platform:SuperAdminPhones"))
            .Distinct()
            .ToList();

        // Existing users whose flag changes: their cached access (template context) is stale
        var changed = await transactions.RunAsync(async token =>
        {
            var users = await db.Users.Where(u => u.IsSuperAdmin || phones.Contains(u.Phone)).ToListAsync(token);
            foreach (var phone in phones.Where(p => users.All(u => u.Phone != p)))
            {
                var user = new User { Phone = phone };
                users.Add(user);
                db.Users.Add(user);
            }

            var demoted = new List<int>();
            var changedIds = new List<int>();
            foreach (var user in users)
            {
                var isSuperAdmin = phones.Contains(user.Phone);
                if (user.IsSuperAdmin && !isSuperAdmin)
                    demoted.Add(user.Id);
                if (user.Id != 0 && user.IsSuperAdmin != isSuperAdmin)
                    changedIds.Add(user.Id);
                user.IsSuperAdmin = isSuperAdmin;
            }

            var now = DateTime.UtcNow;
            await db.Sessions.Where(s => demoted.Contains(s.UserId) && s.RevokedAt == null)
                .ExecuteUpdateAsync(s => s.SetProperty(x => x.RevokedAt, now).SetProperty(x => x.UpdatedAt, now), token);
            await db.SaveChangesAsync(token);
            return changedIds;
        }, _ => true, cancellationToken);

        // After the commit. In memory a restart clears the cache anyway; a distributed cache (Redis) would keep it
        foreach (var userId in changed)
            await accessCache.InvalidateUserAsync(userId, cancellationToken);
    }

    /// <summary>Finds or creates the user of a phone from configuration (invalid → startup error).</summary>
    public async Task<User> EnsureUserAsync(string phone, string setting, CancellationToken cancellationToken = default)
    {
        var normalized = NormalizeConfigPhone(phone, setting);
        var user = await db.Users.FirstOrDefaultAsync(u => u.Phone == normalized, cancellationToken);
        if (user is not null)
            return user;
        user = new User { Phone = normalized };
        db.Users.Add(user);
        await db.SaveChangesAsync(cancellationToken);
        return user;
    }

    private string NormalizeConfigPhone(string phone, string setting) =>
        PhoneNormalizer.Normalize(phone, platform.DefaultRegion)
        ?? throw new InvalidOperationException($"{setting}: '{phone}' is not a valid phone number.");
}
