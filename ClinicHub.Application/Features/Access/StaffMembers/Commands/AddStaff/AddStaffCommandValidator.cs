using ClinicHub.Application.Common.Settings;
using ClinicHub.Application.Common.Validation;
using ClinicHub.Application.Features.Identity.Users;
using FluentValidation;

namespace ClinicHub.Application.Features.Access.StaffMembers.Commands.AddStaff;

/// <summary>
/// In the order the errors are reported (the form's order): phone, full name (the column's limit,
/// <c>FieldLimits.NameMaxLength</c>), roles. Whether the roles are this clinic's is checked by the handler.
/// </summary>
internal sealed class AddStaffCommandValidator : AbstractValidator<AddStaffCommand>
{
    public AddStaffCommandValidator(IPhoneNormalizer phoneNormalizer, PlatformSettings platform)
    {
        RuleFor(x => x.Phone).ValidPhone(phoneNormalizer, platform.DefaultRegion);
        RuleFor(x => x.FullName).ValidName();
        RuleFor(x => x.RoleIds).Must(ids => ids is { Count: > 0 }).WithError(StaffErrors.RolesRequired);
    }
}
