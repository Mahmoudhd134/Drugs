using System.ComponentModel;
using Drags.Api.Database;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Hybrid;

namespace Drags.Api.Features.Access;

/// <summary>A staff member's access, as cached. <see cref="IsOwner"/> = one of <see cref="RoleIds"/> is the Owner role.</summary>
[ImmutableObject(true)]
public sealed record StaffAccess(
    int StaffId, int UserId, int ClinicId, string FullName, bool IsActive, string ClinicStatus, bool IsOwner,
    IReadOnlyList<int> RoleIds);

[ImmutableObject(true)]
public sealed record RoleAccess(int RoleId, int ClinicId, IReadOnlyList<string> Permissions);

[ImmutableObject(true)]
public sealed record UserAccess(int UserId, bool IsSuperAdmin);

[ImmutableObject(true)]
public sealed record ClinicAccess(int ClinicId, string Status, bool IsTemplate);

/// <summary>
/// Cached reads for the per-request access checks. The only code that knows the cache keys, tags and
/// library (HybridCache: in memory now; a distributed L2 such as Redis is config only). On a miss one
/// query loads the entry, once even under concurrent requests. Whoever changes staff, roles, clinics
/// or users must call the matching <c>Invalidate*</c> (table in docs/features/access/tech.md).
/// </summary>
public interface IAccessCache
{
    /// <summary>
    /// Key <c>access:staff:{staffId}:{userId}:{clinicId}</c>, tags staff, user, clinic.
    /// <paramref name="userId"/> and <paramref name="clinicId"/> come from the token; they are part of
    /// the key, so the tags always match the entry and a token with other ids gets its own (null) entry.
    /// </summary>
    Task<StaffAccess> GetStaffAsync(int staffId, int userId, int clinicId, CancellationToken cancellationToken = default);

    /// <summary>Key <c>access:role:{roleId}:{clinicId}</c>, tags role, clinic. Null when the role is not in that clinic.</summary>
    Task<RoleAccess> GetRolePermissionsAsync(int roleId, int clinicId, CancellationToken cancellationToken = default);

    /// <summary>Key <c>access:user:{userId}</c>, tag user. For the super admin's template context.</summary>
    Task<UserAccess> GetUserAsync(int userId, CancellationToken cancellationToken = default);

    /// <summary>Key <c>access:clinic:{clinicId}</c>, tag clinic. For the super admin's template context.</summary>
    Task<ClinicAccess> GetClinicAsync(int clinicId, CancellationToken cancellationToken = default);

    /// <summary>A staff member's roles or active flag changed, or a token was issued for them.</summary>
    Task InvalidateStaffAsync(int staffId, CancellationToken cancellationToken = default);
    /// <summary>A role's permissions or name changed (also call <see cref="InvalidateClinicAsync"/> when it is deleted).</summary>
    Task InvalidateRoleAsync(int roleId, CancellationToken cancellationToken = default);
    /// <summary>The clinic's status changed or one of its roles was deleted: every entry of the clinic.</summary>
    Task InvalidateClinicAsync(int clinicId, CancellationToken cancellationToken = default);
    /// <summary>A user-level change (e.g. the super-admin flag): every entry of the user.</summary>
    Task InvalidateUserAsync(int userId, CancellationToken cancellationToken = default);
}

/// <summary>
/// Reads bypass the clinic query filter on purpose (read only, by id, like
/// <see cref="MembershipService"/>): they decide whether the request's clinic may be used at all.
/// Each miss loads in its own DI scope (its own <see cref="AppDbContext"/>): concurrent requests wait
/// on one shared load, which must not depend on the first caller's request staying alive.
/// </summary>
public class AccessCache(HybridCache cache, IServiceScopeFactory scopes) : IAccessCache
{
    /// <summary>A safety net if an invalidation is missed.</summary>
    public static readonly TimeSpan Expiration = TimeSpan.FromMinutes(10);
    /// <summary>The in-memory copy; bounds staleness between servers once a distributed cache is added.</summary>
    public static readonly TimeSpan LocalCacheExpiration = TimeSpan.FromSeconds(30);

    private static string StaffTag(int id) => $"staff:{id}";
    private static string RoleTag(int id) => $"role:{id}";
    private static string UserTag(int id) => $"user:{id}";
    private static string ClinicTag(int id) => $"clinic:{id}";

    public async Task<StaffAccess> GetStaffAsync(int staffId, int userId, int clinicId,
        CancellationToken cancellationToken = default) =>
        await cache.GetOrCreateAsync($"access:staff:{staffId}:{userId}:{clinicId}", (scopes, staffId, userId, clinicId),
            static (state, token) => LoadAsync(state.scopes, db => db.Staff.IgnoreQueryFilters().AsNoTracking()
                    .Where(s => s.Id == state.staffId && s.UserId == state.userId && s.ClinicId == state.clinicId)
                    .Select(s => new StaffAccess(
                        s.Id, s.UserId, s.ClinicId, s.FullName, s.IsActive,
                        db.Clinics.Where(c => c.Id == s.ClinicId).Select(c => c.Status).First(),
                        s.Roles.Any(r => r.Role.IsOwner),
                        s.Roles.OrderBy(r => r.RoleId).Select(r => r.RoleId).ToList()))
                    .FirstOrDefaultAsync(token)),
            tags: [StaffTag(staffId), UserTag(userId), ClinicTag(clinicId)],
            cancellationToken: cancellationToken);

    public async Task<RoleAccess> GetRolePermissionsAsync(int roleId, int clinicId,
        CancellationToken cancellationToken = default) =>
        await cache.GetOrCreateAsync($"access:role:{roleId}:{clinicId}", (scopes, roleId, clinicId),
            static (state, token) => LoadAsync(state.scopes, db => db.Roles.IgnoreQueryFilters().AsNoTracking()
                .Where(r => r.Id == state.roleId && r.ClinicId == state.clinicId)
                .Select(r => new RoleAccess(r.Id, r.ClinicId, r.Permissions.Select(p => p.Permission).ToList()))
                .FirstOrDefaultAsync(token)),
            tags: [RoleTag(roleId), ClinicTag(clinicId)],
            cancellationToken: cancellationToken);

    public async Task<UserAccess> GetUserAsync(int userId, CancellationToken cancellationToken = default) =>
        await cache.GetOrCreateAsync($"access:user:{userId}", (scopes, userId),
            static (state, token) => LoadAsync(state.scopes, db => db.Users.AsNoTracking()
                .Where(u => u.Id == state.userId)
                .Select(u => new UserAccess(u.Id, u.IsSuperAdmin))
                .FirstOrDefaultAsync(token)),
            tags: [UserTag(userId)],
            cancellationToken: cancellationToken);

    public async Task<ClinicAccess> GetClinicAsync(int clinicId, CancellationToken cancellationToken = default) =>
        await cache.GetOrCreateAsync($"access:clinic:{clinicId}", (scopes, clinicId),
            static (state, token) => LoadAsync(state.scopes, db => db.Clinics.AsNoTracking()
                .Where(c => c.Id == state.clinicId)
                .Select(c => new ClinicAccess(c.Id, c.Status, c.IsTemplate))
                .FirstOrDefaultAsync(token)),
            tags: [ClinicTag(clinicId)],
            cancellationToken: cancellationToken);

    /// <summary>Runs one load in a fresh scope (its own DbContext).</summary>
    private static async ValueTask<T> LoadAsync<T>(IServiceScopeFactory scopes, Func<AppDbContext, Task<T>> query)
    {
        await using var scope = scopes.CreateAsyncScope();
        return await query(scope.ServiceProvider.GetRequiredService<AppDbContext>());
    }

    public Task InvalidateStaffAsync(int staffId, CancellationToken cancellationToken = default) =>
        cache.RemoveByTagAsync(StaffTag(staffId), cancellationToken).AsTask();

    public Task InvalidateRoleAsync(int roleId, CancellationToken cancellationToken = default) =>
        cache.RemoveByTagAsync(RoleTag(roleId), cancellationToken).AsTask();

    public Task InvalidateClinicAsync(int clinicId, CancellationToken cancellationToken = default) =>
        cache.RemoveByTagAsync(ClinicTag(clinicId), cancellationToken).AsTask();

    public Task InvalidateUserAsync(int userId, CancellationToken cancellationToken = default) =>
        cache.RemoveByTagAsync(UserTag(userId), cancellationToken).AsTask();
}
