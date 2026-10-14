namespace ClinicHub.Application.Features.Access.StaffMembers;

/// <param name="Roles">The user's role names in the clinic (Owner first, then by name).</param>
internal sealed record MemberClinic(int ClinicId, string ClinicName, List<string> Roles);

/// <summary>A user's staff memberships across clinics, for login and context checks (read only, across clinics).</summary>
internal interface IMembershipService
{
    /// <summary>Active, non-deleted, non-template clinics where the user is active staff, by name, with their roles there.</summary>
    Task<List<MemberClinic>> GetEnterableClinicsAsync(int userId, CancellationToken cancellationToken);

    /// <summary>The user's active staff row in the clinic, if any.</summary>
    Task<int?> GetStaffIdAsync(int userId, int clinicId, CancellationToken cancellationToken);

    Task<bool> IsActiveMemberAsync(int userId, int clinicId, CancellationToken cancellationToken);
}
