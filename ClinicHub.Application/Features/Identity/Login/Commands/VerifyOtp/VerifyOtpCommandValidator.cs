using ClinicHub.Application.Common.Settings;
using ClinicHub.Application.Features.Identity.Users;
using FluentValidation;

namespace ClinicHub.Application.Features.Identity.Login.Commands.VerifyOtp;

internal sealed class VerifyOtpCommandValidator : AbstractValidator<VerifyOtpCommand>
{
    public VerifyOtpCommandValidator(IPhoneNormalizer phoneNormalizer, PlatformSettings platform)
    {
        RuleFor(x => x.Phone).ValidPhone(phoneNormalizer, platform.DefaultRegion);
    }
}
