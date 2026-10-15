using ClinicHub.Application.Common.Results;

namespace ClinicHub.Application.Features.Access.Roles;

/// <summary>
/// Role errors (design M1.5 § 7). Name rules: <see cref="CommonErrors.NameRequired"/>,
/// <see cref="CommonErrors.NameInvalid"/>, <see cref="CommonErrors.NameTooLong"/> (at most
/// <c>FieldLimits.RoleNameMaxLength</c>).
/// </summary>
public static class RoleErrors
{
    /// <summary>Code <c>notFound</c>: no such role in the current clinic (another clinic's role too).</summary>
    public static readonly Error NotFound =
        new(CommonErrors.NotFound.Code, "The role does not exist in this clinic.", ErrorType.NotFound);

    /// <summary>
    /// Another role of the clinic has the name (trimmed, case-insensitive), or the name reads like the Owner role in
    /// any UI language ("Owner", «المالك»: <see cref="RoleRules.IsOwnerLabel"/>).
    /// </summary>
    public static readonly Error NameTaken =
        new("roleNameTaken", "Another role of this clinic has this name.", ErrorType.Conflict);

    /// <summary>A permission key that is not in the catalog.</summary>
    public static readonly Error UnknownPermission =
        new("unknownPermission", "The permission does not exist.", ErrorType.Validation);

    /// <summary>The Owner role can't be edited or deleted (it always has every permission).</summary>
    public static readonly Error Locked =
        new("roleLocked", "The Owner role can't be changed.", ErrorType.Conflict);

    /// <summary>Staff still hold the role (active or not).</summary>
    public static readonly Error InUse =
        new("roleInUse", "Staff still hold this role.", ErrorType.Conflict);
}
