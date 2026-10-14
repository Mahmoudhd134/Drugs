using ClinicHub.Application.Common.Results;

namespace ClinicHub.Application.Features.Access;

/// <summary>
/// 403 reasons of the per-request clinic access check (besides <see cref="CommonErrors.Forbidden"/>).
/// Used by the Api's authorization handlers and by login (<c>noAccess</c>).
/// </summary>
public static class AccessErrors
{
    /// <summary>No active staff row in the clinic (also: a login for a phone without access).</summary>
    public static readonly Error NoAccess =
        new("noAccess", "You have no access to this clinic.", ErrorType.Forbidden);

    public static readonly Error ClinicSuspended =
        new("clinicSuspended", "The clinic is suspended.", ErrorType.Forbidden);
}
