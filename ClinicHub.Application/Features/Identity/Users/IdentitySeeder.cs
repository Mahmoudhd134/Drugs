using ClinicHub.Application.Common.Abstractions;
using ClinicHub.Application.Common.Settings;
using ClinicHub.Application.Features.Access.Authorization;
using Microsoft.EntityFrameworkCore;

namespace ClinicHub.Application.Features.Identity.Users;

/// <summary>
/// Startup seeding of users (idempotent, every start; called by Infrastructure's <c>StartupSeeder</c>). A
/// service, not a use case: it runs before the app serves requests, on <see cref="IAppDbContext"/> and
/// <see cref="ITransactionRunner"/> only.
/// </summary>
public sealed class IdentitySeeder(
    IAppDbContext db,
    ITransactionRunner transactions,
    IAccessCache accessCache,
    IUserAccounts userAccounts,
    IPhoneNormalizer phoneNormalizer,
    PlatformSettings platform) : IIdentitySeeder
{
    public async Task SeedSuperAdminsAsync(CancellationToken cancellationToken = default)
    {
        var phones = platform.SuperAdminPhones
            .Where(p => !string.IsNullOrWhiteSpace(p))
            .Select(p => ConfigPhones.Normalize(phoneNormalizer, p, platform.DefaultRegion, "Platform:SuperAdminPhones"))
            .Distinct()
            .ToList();

        // Users whose flag changes: their cached access (template context) is stale
        var changed = await transactions.RunAsync(async token =>
        {
            foreach (var phone in phones)
                await userAccounts.GetOrCreateAsync(phone, token);
            var users = await db.Users.Where(u => u.IsSuperAdmin || phones.Contains(u.Phone)).ToListAsync(token);

            var demoted = new List<int>();
            var changedIds = new List<int>();
            foreach (var user in users)
            {
                var isSuperAdmin = phones.Contains(user.Phone);
                if (user.IsSuperAdmin && !isSuperAdmin)
                    demoted.Add(user.Id);
                if (user.IsSuperAdmin != isSuperAdmin)
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
}
