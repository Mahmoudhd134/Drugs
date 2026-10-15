using ClinicHub.Application.Common.Messaging;

namespace ClinicHub.Application.Features.Access.StaffMembers.Commands.UpdateStaff;

/// <summary>
/// Changes a staff member's name, active flag and roles (replaced by <paramref name="RoleIds"/>, duplicates ignored).
/// The phone can't change (design § 6). Takes effect on their next request; <c>lastOwner</c> keeps one active Owner.
/// </summary>
/// <param name="IsActive">Required (a missing value is <c>invalidRequest</c>, never "deactivate").</param>
public record UpdateStaffCommand(int Id, string FullName, bool? IsActive, List<int> RoleIds) : ICommand<StaffMemberDto>;
