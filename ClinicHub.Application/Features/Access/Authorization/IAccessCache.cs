using System.ComponentModel;

namespace ClinicHub.Application.Features.Access.Authorization;

/// <summary>
/// A staff member's access, as cached. <see cref="IsClinicDeleted"/> = the clinic is soft deleted;
/// <see cref="IsOwner"/> = one of <see cref="RoleIds"/> is the Owner role.
/// </summary>
[ImmutableObject(true)]
public sealed record StaffAccess(
    int StaffId, int UserId, int ClinicId, string FullName, bool IsActive, string ClinicStatus, bool IsClinicDeleted,
    bool IsOwner, IReadOnlyList<int> RoleIds);

[ImmutableObject(true)]
public sealed record RoleAccess(int RoleId, int ClinicId, IReadOnlyList<string> Permissions);

[ImmutableObject(true)]
public sealed record UserAccess(int UserId, bool IsSuperAdmin);

/// <summary><see cref="IsDeleted"/> = the clinic is soft deleted.</summary>
[ImmutableObject(true)]
public sealed record ClinicAccess(int ClinicId, string Status, bool IsTemplate, bool IsDeleted);

/// <summary>
/// Cached reads for the per-request access checks (implemented in Infrastructure: the only code that
/// knows the cache keys, tags and library). On a miss one query loads the entry, once even under
/// concurrent requests. Whoever changes staff, roles, clinics or users must call the matching
/// <c>Invalidate*</c> (table in docs/features/access/tech.md).
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
    /// <summary>The clinic's status changed, it was deleted, or one of its roles was deleted: every entry of the clinic.</summary>
    Task InvalidateClinicAsync(int clinicId, CancellationToken cancellationToken = default);
    /// <summary>A user-level change (e.g. the super-admin flag): every entry of the user.</summary>
    Task InvalidateUserAsync(int userId, CancellationToken cancellationToken = default);
}
