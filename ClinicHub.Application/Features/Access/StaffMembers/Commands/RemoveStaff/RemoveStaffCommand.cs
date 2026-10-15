using ClinicHub.Application.Common.Messaging;

namespace ClinicHub.Application.Features.Access.StaffMembers.Commands.RemoveStaff;

/// <summary>
/// A real delete of the staff row (their roles go with it; the user and their other clinics stay). Takes effect on
/// their next request; <c>lastOwner</c> keeps one active Owner.
/// </summary>
public record RemoveStaffCommand(int Id) : ICommand;
