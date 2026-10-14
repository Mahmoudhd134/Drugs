using ClinicHub.Application.Common.Abstractions;
using ClinicHub.Application.Common.Results;
using ClinicHub.Domain.Platform;

namespace ClinicHub.Application.Features.Access;

/// <summary>The caller's access to the request's clinic and their permissions there (rules only; storage is <see cref="IAccessCache"/>).</summary>
public interface IPermissionService
{
    /// <summary>
    /// Null when the caller may act in the request's clinic; otherwise <see cref="AccessErrors.NoAccess"/>
    /// (staff gone or inactive), <see cref="AccessErrors.ClinicSuspended"/>, or <see cref="CommonErrors.Forbidden"/>
    /// (not a clinic context).
    /// </summary>
    Task<Error> CheckClinicAccessAsync(CancellationToken cancellationToken = default);

    /// <summary>The caller's permissions in the request's clinic (<see cref="PermissionSet.None"/> without access).</summary>
    Task<PermissionSet> GetAsync(CancellationToken cancellationToken = default);
}

/// <summary>
/// Scoped: computed once per request. The permissions are the union of the staff member's roles,
/// each role's keys cached separately and merged in memory. The Owner role and the super admin in
/// the template clinic get every permission.
/// </summary>
internal sealed class PermissionService(ICurrentUser currentUser, IAccessCache cache) : IPermissionService
{
    private sealed record Check(PermissionSet Permissions, Error Error);

    private static readonly Check NotClinic = new(PermissionSet.None, CommonErrors.Forbidden);
    private static readonly Check NoAccess = new(PermissionSet.None, AccessErrors.NoAccess);
    private static readonly Check Suspended = new(PermissionSet.None, AccessErrors.ClinicSuspended);

    private Task<Check> check;

    public async Task<Error> CheckClinicAccessAsync(CancellationToken cancellationToken = default) =>
        (await GetCheckAsync(cancellationToken)).Error;

    public async Task<PermissionSet> GetAsync(CancellationToken cancellationToken = default) =>
        (await GetCheckAsync(cancellationToken)).Permissions;

    // Scoped: one request, not thread safe
    private Task<Check> GetCheckAsync(CancellationToken cancellationToken) =>
        check ??= LoadAsync(cancellationToken);

    private async Task<Check> LoadAsync(CancellationToken cancellationToken)
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
            return clinic.Status == ClinicStatus.Active ? new Check(PermissionSet.All, null) : Suspended;
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
            return new Check(PermissionSet.All, null);

        // One cached entry per role, merged in memory
        var roles = await Task.WhenAll(staff.RoleIds.Select(roleId =>
            cache.GetRolePermissionsAsync(roleId, clinicId, cancellationToken)));
        return new Check(PermissionSet.Of(roles.Where(r => r is not null).SelectMany(r => r.Permissions)), null);
    }
}
