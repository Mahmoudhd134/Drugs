using ClinicHub.Application.Features.Access.Authorization;
using ClinicHub.Infrastructure.Database;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Hybrid;
using Microsoft.Extensions.DependencyInjection;

namespace ClinicHub.Infrastructure.Access;

/// <summary>
/// Reads bypass the clinic query filter on purpose (read only, by id, like
/// Access's <c>IMembershipService</c>): they decide whether the request's clinic may be used at all.
/// Each miss loads in its own DI scope (its own <see cref="AppDbContext"/>): concurrent requests wait
/// on one shared load, which must not depend on the first caller's request staying alive.
/// </summary>
public sealed class AccessCache(HybridCache cache, IServiceScopeFactory scopes) : IAccessCache
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
                    .Join(db.Clinics, s => s.ClinicId, c => c.Id, (s, c) => new { Staff = s, Clinic = c })
                    .Select(x => new StaffAccess(
                        x.Staff.Id, x.Staff.UserId, x.Staff.ClinicId, x.Staff.FullName, x.Staff.IsActive,
                        x.Clinic.Status,
                        x.Clinic.DeletedAt != null,
                        x.Staff.Roles.Any(r => r.Role.IsOwner),
                        x.Staff.Roles.OrderBy(r => r.RoleId).Select(r => r.RoleId).ToList()))
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
                .Select(c => new ClinicAccess(c.Id, c.Status, c.IsTemplate, c.DeletedAt != null))
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
