using Drags.Api.Models;
using Drags.Api.Shared;

namespace Drags.Api.Features.Access;

/// <summary>The caller's access to the request's clinic and their permissions there (rules only; storage is <see cref="IAccessCache"/>).</summary>
public interface IPermissionService
{
    /// <summary>
    /// Null when the caller may act in the request's clinic; otherwise <see cref="ErrorCodes.NoAccess"/>
    /// (staff gone or inactive), <see cref="ErrorCodes.ClinicSuspended"/>, or <see cref="ErrorCodes.Forbidden"/>
    /// (not a clinic context).
    /// </summary>
    Task<string> CheckClinicAccessAsync(CancellationToken cancellationToken = default);

    /// <summary>The caller's permissions in the request's clinic (<see cref="PermissionSet.None"/> without access).</summary>
    Task<PermissionSet> GetAsync(CancellationToken cancellationToken = default);

    /// <summary>Throws <see cref="AccessDeniedException"/> (→ 403) unless the caller has the permission.</summary>
    Task EnsureAsync(string permission, CancellationToken cancellationToken = default);
}

/// <summary>
/// Scoped: computed once per request. The permissions are the union of the staff member's roles,
/// each role's keys cached separately and merged in memory. The Owner role and the super admin in
/// the template clinic get every permission.
/// </summary>
public class PermissionService(ICurrentUser currentUser, IAccessCache cache) : IPermissionService
{
    private sealed record Result(PermissionSet Permissions, string Error);

    private static readonly Result NotClinic = new(PermissionSet.None, ErrorCodes.Forbidden);
    private static readonly Result NoAccess = new(PermissionSet.None, ErrorCodes.NoAccess);
    private static readonly Result Suspended = new(PermissionSet.None, ErrorCodes.ClinicSuspended);

    private Task<Result> result;

    public async Task<string> CheckClinicAccessAsync(CancellationToken cancellationToken = default) =>
        (await GetResultAsync(cancellationToken)).Error;

    public async Task<PermissionSet> GetAsync(CancellationToken cancellationToken = default) =>
        (await GetResultAsync(cancellationToken)).Permissions;

    public async Task EnsureAsync(string permission, CancellationToken cancellationToken = default)
    {
        var check = await GetResultAsync(cancellationToken);
        if (check.Error is not null)
            throw new AccessDeniedException(check.Error);
        if (!check.Permissions.Has(permission))
            throw new AccessDeniedException(ErrorCodes.Forbidden);
    }

    // Scoped: one request, not thread safe
    private Task<Result> GetResultAsync(CancellationToken cancellationToken) =>
        result ??= LoadAsync(cancellationToken);

    private async Task<Result> LoadAsync(CancellationToken cancellationToken)
    {
        if (!currentUser.IsClinic || currentUser.UserId is not { } userId || currentUser.ClinicId is not { } clinicId)
            return NotClinic;

        // No staff row: only the super admin's template context is issued like that
        if (currentUser.StaffId is not { } staffId)
        {
            var user = await cache.GetUserAsync(userId, cancellationToken);
            var clinic = await cache.GetClinicAsync(clinicId, cancellationToken);
            if (user is not { IsSuperAdmin: true } || clinic is not { IsTemplate: true })
                return NoAccess;
            return clinic.Status == ClinicStatus.Active ? new Result(PermissionSet.All, null) : Suspended;
        }

        var staff = await cache.GetStaffAsync(staffId, userId, clinicId, cancellationToken);
        if (staff is null)
            return NoAccess;
        // The clinic first: the more specific reason when both apply
        if (staff.ClinicStatus != ClinicStatus.Active)
            return Suspended;
        if (!staff.IsActive)
            return NoAccess;
        if (staff.IsOwner)
            return new Result(PermissionSet.All, null);

        // One cached entry per role, merged in memory
        var roles = await Task.WhenAll(staff.RoleIds.Select(roleId =>
            cache.GetRolePermissionsAsync(roleId, clinicId, cancellationToken)));
        return new Result(PermissionSet.Of(roles.Where(r => r is not null).SelectMany(r => r.Permissions)), null);
    }
}
