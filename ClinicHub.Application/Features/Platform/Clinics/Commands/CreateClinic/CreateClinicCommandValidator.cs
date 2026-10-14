using ClinicHub.Application.Common.Results;
using ClinicHub.Application.Common.Settings;
using ClinicHub.Application.Common.Validation;
using ClinicHub.Application.Features.Identity.Users;
using FluentValidation;

namespace ClinicHub.Application.Features.Platform.Clinics.Commands.CreateClinic;

/// <summary>
/// In the order the errors are reported (the form's order): clinic name, owner phone, owner name. Both names
/// have the column's limit (<c>FieldLimits.NameMaxLength</c>, clinics and staff alike).
/// </summary>
internal sealed class CreateClinicCommandValidator : AbstractValidator<CreateClinicCommand>
{
    public CreateClinicCommandValidator(IPhoneNormalizer phoneNormalizer, PlatformSettings platform)
    {
        RuleFor(x => x.Name).ValidName();
        RuleFor(x => x.Owner).NotNull().WithError(CommonErrors.InvalidRequest);
        When(x => x.Owner is not null, () =>
        {
            RuleFor(x => x.Owner.Phone).ValidPhone(phoneNormalizer, platform.DefaultRegion);
            RuleFor(x => x.Owner.FullName).ValidName();
        });
    }
}
