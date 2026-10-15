using ClinicHub.Application.Common.Settings;
using ClinicHub.Application.Features.Identity.Login.Commands.RequestOtp;
using ClinicHub.Application.Features.Identity.Users;
using ClinicHub.UnitTests.TestSupport;
using Shouldly;

namespace ClinicHub.UnitTests.Identity.Login;

/// <summary>
/// <c>POST /auth/otp/request</c> validation (auth tech § Backend): a phone the normalizer accepts (local numbers in the
/// default region EG, landlines too), else 400 <c>invalidPhone</c> on <c>phone</c>.
/// </summary>
[Trait("Area", "auth")]
public class RequestOtpCommandValidatorTests
{
    private static ApiValidationAnswer Validate(string phone) =>
        ApiValidation.Run(new RequestOtpCommandValidator(new PhoneNormalizer(), new PlatformSettings()),
            new RequestOtpCommand(phone));

    [Theory]
    [InlineData("01001234567")]
    [InlineData("+201001234567")]
    [InlineData("٠١٠٠١٢٣٤٥٦٧")]
    [InlineData("0223456789")]
    public void A_valid_phone_passes(string phone)
    {
        Validate(phone).IsValid.ShouldBeTrue();
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("abc")]
    [InlineData("0100123")]
    [InlineData("010012345678")]
    public void An_invalid_phone_is_invalid_phone_on_phone(string phone)
    {
        var answer = Validate(phone);

        answer.Status.ShouldBe(400);
        answer.Code.ShouldBe("invalidPhone");
        answer.Errors.ShouldBe([new ApiFieldError("invalidPhone", "phone")]);
    }

    [Fact]
    public void The_default_region_is_egypt()
    {
        new PlatformSettings().DefaultRegion.ShouldBe("EG");
    }
}
