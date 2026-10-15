using ClinicHub.Application.Common.Results;

namespace ClinicHub.Application.Features.Access;

/// <summary>
/// 403 reasons of the per-request clinic access check (besides <see cref="CommonErrors.Forbidden"/>).
/// Used by the Api's authorization handlers and by login and the clinic picker (where the reason may name the
/// clinic: <see cref="ClinicError"/>).
/// </summary>
public static class AccessErrors
{
    /// <summary>No active staff row in the clinic (also: a login for a phone without access).</summary>
    public static readonly Error NoAccess =
        new("noAccess", "You have no access to this clinic.", ErrorType.Forbidden);

    public static readonly Error ClinicSuspended =
        new("clinicSuspended", "The clinic is suspended.", ErrorType.Forbidden);

    /// <summary>
    /// Login and the clinic picker only (M1.6.0): the user's staff account in an active clinic is deactivated. A
    /// request inside the clinic still answers <see cref="NoAccess"/>.
    /// </summary>
    public static readonly Error StaffInactive =
        new("staffInactive", "Your staff account in this clinic is deactivated.", ErrorType.Forbidden);
}
