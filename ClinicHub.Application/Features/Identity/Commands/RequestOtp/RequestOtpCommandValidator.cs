using ClinicHub.Application.Common.Settings;
using FluentValidation;

namespace ClinicHub.Application.Features.Identity.Commands.RequestOtp;

internal sealed class RequestOtpCommandValidator : AbstractValidator<RequestOtpCommand>
{
    public RequestOtpCommandValidator(PlatformSettings platform)
    {
        RuleFor(x => x.Phone).ValidPhone(platform.DefaultRegion);
    }
}
