namespace ClinicHub.Application.Common.Abstractions;

/// <summary>The caller, read from the access token's claims (scoped per request; implemented in the Api).</summary>
public interface ICurrentUser
{
    bool IsAuthenticated { get; }
    int? UserId { get; }
    Guid? SessionId { get; }
    /// <summary>Set in a clinic context (for a super admin, also the template clinic).</summary>
    int? ClinicId { get; }
    /// <summary>The caller's staff row in <see cref="ClinicId"/>; null in the template clinic.</summary>
    int? StaffId { get; }
    bool IsClinic { get; }
    bool IsPlatform { get; }
    /// <summary>
    /// Only true in the platform context (the claim is only issued there). The token's claim, possibly stale
    /// (up to the token's lifetime): not for authorization, use <c>IAccessCache.GetUserAsync</c>.
    /// </summary>
    bool IsSuperAdmin { get; }
}
