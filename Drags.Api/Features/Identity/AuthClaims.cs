namespace Drags.Api.Features.Identity;

/// <summary>Claim names in the access token (HLD 7.1). Inbound claim mapping is off, so these arrive as-is.</summary>
public static class AuthClaims
{
    public const string UserId = "sub";
    public const string SessionId = "sid";
    /// <summary>"clinic" or "platform"; absent until a context is chosen.</summary>
    public const string Context = "ctx";
    public const string ClinicId = "clinic_id";
    public const string StaffId = "staff_id";
    /// <summary>"true", only on platform-context tokens.</summary>
    public const string SuperAdmin = "super_admin";
}

public static class AuthPolicies
{
    /// <summary>
    /// An access token in a clinic context, and the staff member and clinic still active (cached
    /// check, <c>Access.ClinicAccessRequirement</c>). Platform or no-context tokens → 403
    /// <c>forbidden</c>; inactive staff → <c>noAccess</c>; suspended clinic → <c>clinicSuspended</c>.
    /// Implied by <c>[HasPermission]</c>.
    /// </summary>
    public const string ClinicContext = "ClinicContext";
}
