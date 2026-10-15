using ClinicHub.Application.Common.Results;

namespace ClinicHub.Application.Features.Access.StaffMembers;

/// <summary>
/// Staff errors (design M1.5 § 7). Also: <c>IdentityErrors.InvalidPhone</c> and the name rules
/// (<see cref="CommonErrors.NameRequired"/>, <see cref="CommonErrors.NameInvalid"/>, <see cref="CommonErrors.NameTooLong"/>).
/// </summary>
public static class StaffErrors
{
    /// <summary>Code <c>notFound</c>: no such staff member in the current clinic (another clinic's too).</summary>
    public static readonly Error NotFound =
        new(CommonErrors.NotFound.Code, "The staff member does not exist in this clinic.", ErrorType.NotFound);

    public static readonly Error RolesRequired =
        new("rolesRequired", "At least one role is required.", ErrorType.Validation);

    /// <summary>A <c>roleIds</c> entry that is not a role of the current clinic.</summary>
    public static readonly Error RoleNotFound =
        new("roleNotFound", "A role does not exist in this clinic.", ErrorType.Validation, "roleIds");

    /// <summary>The phone's user is already staff in the clinic, active or not (one staff row per person per clinic).</summary>
    public static readonly Error StaffExists =
        new("staffExists", "This phone is already staff in this clinic.", ErrorType.Conflict);

    /// <summary>The change would leave the clinic without an active staff member holding the Owner role.</summary>
    public static readonly Error LastOwner =
        new("lastOwner", "The clinic must keep at least one active owner.", ErrorType.Conflict);
}
