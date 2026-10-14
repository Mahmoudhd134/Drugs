using ClinicHub.Application.Common.Results;

namespace ClinicHub.Application.Features.Access;

/// <summary>
/// 403 reasons of the per-request clinic access check (besides <see cref="CommonErrors.Forbidden"/>).
/// The Access module itself moves here in Phase 3.5 step 3.
/// </summary>
public static class AccessErrors
{
    /// <summary>No active staff row in the clinic (also: a login for a phone without access).</summary>
    public static readonly Error NoAccess =
        new("noAccess", "You have no access to this clinic.", ErrorType.Forbidden);

    public static readonly Error ClinicSuspended =
        new("clinicSuspended", "The clinic is suspended.", ErrorType.Forbidden);
}
