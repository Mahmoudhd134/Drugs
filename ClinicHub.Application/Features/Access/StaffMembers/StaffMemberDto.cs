using ClinicHub.Domain.Access;

namespace ClinicHub.Application.Features.Access.StaffMembers;

/// <param name="Phone">The user's phone, E.164 (it can't be changed here: remove and add again).</param>
/// <param name="Roles">The Owner role first, then by name.</param>
public record StaffMemberDto(int Id, int UserId, string Phone, string FullName, bool IsActive, List<StaffRoleDto> Roles);

public record StaffRoleDto(int Id, string Name, bool IsOwner);

public static class StaffMappings
{
    /// <summary>Staff (current clinic, query filter) as <see cref="StaffMemberDto"/>, in one query.</summary>
    public static IQueryable<StaffMemberDto> SelectDto(this IQueryable<Staff> staff) =>
        staff.Select(s => new StaffMemberDto(s.Id, s.UserId, s.User.Phone, s.FullName, s.IsActive,
            s.Roles.OrderByDescending(r => r.Role.IsOwner).ThenBy(r => r.Role.Name).ThenBy(r => r.RoleId)
                .Select(r => new StaffRoleDto(r.RoleId, r.Role.Name, r.Role.IsOwner))
                .ToList()));
}
