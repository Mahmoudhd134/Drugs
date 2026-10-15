using ClinicHub.Application.Common.Results;

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

    /// <summary>
    /// Why the user can enter none of their clinics (login, <paramref name="clinicId"/> null) or can't enter that
    /// clinic (the clinic picker), the most specific reason first: a staff row (active or not) in a suspended clinic
    /// (<see cref="AccessErrors.ClinicSuspended"/>), else a deactivated staff row in an active clinic
    /// (<see cref="AccessErrors.StaffInactive"/>), else <see cref="AccessErrors.NoAccess"/> (deleted clinics, removed
    /// staff and other clinics are never revealed). The first two name the clinics with that reason
    /// (<see cref="ClinicError"/>; by name, ordinal, each name once): the picker's one clinic, or every one at login. Template clinics are not looked at.
    /// </summary>
    Task<Error> GetEntryRefusalAsync(int userId, int? clinicId, CancellationToken cancellationToken);
}
