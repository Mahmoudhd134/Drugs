using Drags.Api.Features.Access;
using Drags.Api.Shared;
using Drags.Domain.Identity;
using Drags.Infrastructure.Database;
using Microsoft.EntityFrameworkCore;

namespace Drags.Api.Features.Identity;

/// <summary>Startup seeding of users (idempotent, every start).</summary>
public static class IdentitySeeder
{
    /// <summary>
    /// Every phone in <c>Platform:SuperAdminPhones</c> gets a user with <see cref="User.IsSuperAdmin"/>;
    /// any other user loses the flag, and their sessions are revoked (they may be in a super-admin context).
    /// </summary>
    public static async Task SeedSuperAdminsAsync(AppDbContext db, PlatformSettings platform, IAccessCache accessCache)
    {
        var phones = platform.SuperAdminPhones
            .Where(p => !string.IsNullOrWhiteSpace(p))
            .Select(p => NormalizeConfigPhone(p, "Platform:SuperAdminPhones", platform.DefaultRegion))
            .Distinct()
            .ToList();

        var users = await db.Users.Where(u => u.IsSuperAdmin || phones.Contains(u.Phone)).ToListAsync();
        foreach (var phone in phones.Where(p => users.All(u => u.Phone != p)))
        {
            var user = new User { Phone = phone };
            users.Add(user);
            db.Users.Add(user);
        }

        var demoted = new List<int>();
        // Existing users whose flag changes: their cached access (template context) is stale
        var changed = new List<int>();
        foreach (var user in users)
        {
            var isSuperAdmin = phones.Contains(user.Phone);
            if (user.IsSuperAdmin && !isSuperAdmin)
                demoted.Add(user.Id);
            if (user.Id != 0 && user.IsSuperAdmin != isSuperAdmin)
                changed.Add(user.Id);
            user.IsSuperAdmin = isSuperAdmin;
        }

        await using var transaction = await db.Database.BeginTransactionAsync();
        var now = DateTime.UtcNow;
        await db.Sessions.Where(s => demoted.Contains(s.UserId) && s.RevokedAt == null)
            .ExecuteUpdateAsync(s => s.SetProperty(x => x.RevokedAt, now).SetProperty(x => x.UpdatedAt, now));
        await db.SaveChangesAsync();
        await transaction.CommitAsync();
        // In memory a restart clears the cache anyway; a distributed cache (Redis) would keep it
        foreach (var userId in changed)
            await accessCache.InvalidateUserAsync(userId);
    }

    /// <summary>Finds or creates the user of a phone from configuration (invalid → startup error).</summary>
    public static async Task<User> EnsureUserAsync(AppDbContext db, string phone, string setting, string region)
    {
        var normalized = NormalizeConfigPhone(phone, setting, region);
        var user = await db.Users.FirstOrDefaultAsync(u => u.Phone == normalized);
        if (user is not null)
            return user;
        user = new User { Phone = normalized };
        db.Users.Add(user);
        await db.SaveChangesAsync();
        return user;
    }

    private static string NormalizeConfigPhone(string phone, string setting, string region) =>
        PhoneNormalizer.Normalize(phone, region)
        ?? throw new InvalidOperationException($"{setting}: '{phone}' is not a valid phone number.");
}
