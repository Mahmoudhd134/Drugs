using ClinicHub.Application.Common.Results;
using ClinicHub.Application.Common.Validation;
using FluentValidation;

namespace ClinicHub.Application.Features.Access.StaffMembers.Commands.UpdateStaff;

/// <summary>In the order the errors are reported (the form's order): full name, active flag, roles.</summary>
internal sealed class UpdateStaffCommandValidator : AbstractValidator<UpdateStaffCommand>
{
    public UpdateStaffCommandValidator()
    {
        RuleFor(x => x.FullName).ValidName();
        RuleFor(x => x.IsActive).NotNull().WithError(CommonErrors.InvalidRequest);
        RuleFor(x => x.RoleIds).Must(ids => ids is { Count: > 0 }).WithError(StaffErrors.RolesRequired);
    }
}
