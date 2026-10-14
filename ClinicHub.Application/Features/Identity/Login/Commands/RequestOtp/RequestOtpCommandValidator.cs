using ClinicHub.Application.Common.Settings;
using ClinicHub.Application.Features.Identity.Users;
using FluentValidation;

namespace ClinicHub.Application.Features.Identity.Login.Commands.RequestOtp;

internal sealed class RequestOtpCommandValidator : AbstractValidator<RequestOtpCommand>
{
    public RequestOtpCommandValidator(IPhoneNormalizer phoneNormalizer, PlatformSettings platform)
    {
        RuleFor(x => x.Phone).ValidPhone(phoneNormalizer, platform.DefaultRegion);
    }
}
