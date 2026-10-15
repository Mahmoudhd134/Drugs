using ClinicHub.Application.Common.Messaging;

namespace ClinicHub.Application.Features.Access.StaffMembers.Commands.AddStaff;

/// <summary>
/// Adds a person to the current clinic as active staff with these roles: the user of the phone is reused, or created
/// (<c>IUserAccounts</c>). One staff row per person per clinic (<c>staffExists</c>).
/// </summary>
/// <param name="Phone">As typed (local numbers use <c>Platform:DefaultRegion</c>).</param>
/// <param name="RoleIds">At least one; duplicates are ignored.</param>
public record AddStaffCommand(string Phone, string FullName, List<int> RoleIds) : ICommand<StaffMemberDto>;
