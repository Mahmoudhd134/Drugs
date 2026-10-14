namespace ClinicHub.Infrastructure.Identity;

/// <summary>
/// Claim names in the access token (HLD 7.1), written by <see cref="TokenService"/> and read by the Api's
/// <c>CurrentUser</c> and policies. Inbound claim mapping is off, so these arrive as-is.
/// </summary>
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
