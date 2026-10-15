using ClinicHub.Domain.Access;
using Microsoft.EntityFrameworkCore;

namespace ClinicHub.Application.Features.Access.StaffMembers;

/// <summary>
/// Pure helpers shared by the staff commands: query pieces they compose (the handlers run them; the query filter keeps
/// them to the current clinic) and in-memory rules. Nothing here runs a query.
/// </summary>
internal static class StaffRules
{
    /// <summary>Staff with their roles (and the roles' rows) included.</summary>
    public static IQueryable<Staff> WithRoles(this IQueryable<Staff> staff) =>
        staff.Include(s => s.Roles).ThenInclude(r => r.Role);

    /// <summary>Active staff holding the Owner role.</summary>
    public static IQueryable<Staff> ActiveOwners(this IQueryable<Staff> staff) =>
        staff.Where(s => s.IsActive && s.Roles.Any(r => r.Role.IsOwner));

    /// <summary>
    /// The <c>lastOwner</c> rule (design § 6), first half: a loaded staff member (roles included) who is an active
    /// Owner today and would stop being one (deactivated, removed, or the Owner role taken away). The handler then
    /// refuses unless another active owner exists (<see cref="ActiveOwners"/>). Read, then write, no lock: two such
    /// changes in the very same instant could both pass (accepted for the MVP).
    /// </summary>
    public static bool StopsBeingActiveOwner(Staff staff, bool staysActiveOwner) =>
        staff.IsActive && staff.Roles.Any(r => r.Role.IsOwner) && !staysActiveOwner;
}
