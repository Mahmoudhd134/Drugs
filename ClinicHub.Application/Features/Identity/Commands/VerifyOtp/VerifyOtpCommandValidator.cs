using ClinicHub.Application.Common.Settings;
using FluentValidation;

namespace ClinicHub.Application.Features.Identity.Commands.VerifyOtp;

internal sealed class VerifyOtpCommandValidator : AbstractValidator<VerifyOtpCommand>
{
    public VerifyOtpCommandValidator(PlatformSettings platform)
    {
        RuleFor(x => x.Phone).ValidPhone(platform.DefaultRegion);
    }
}
