namespace ClinicHub.Api.Shared;

/// <summary>The caller, read from the access token's claims (scoped per request; implemented by Identity).</summary>
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
    /// <summary>Only true in the platform context (the claim is only issued there).</summary>
    bool IsSuperAdmin { get; }
}
