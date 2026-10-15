using ClinicHub.Application.Common.Settings;
using ClinicHub.Application.Features.Identity.Login.Commands.VerifyOtp;
using ClinicHub.Application.Features.Identity.Users;
using ClinicHub.UnitTests.TestSupport;
using Shouldly;

namespace ClinicHub.UnitTests.Identity.Login;

/// <summary>
/// <c>POST /auth/otp/verify</c> validation (auth tech § API): the phone as for the request; the code is checked by the
/// handler (<c>invalidCode</c>), not here.
/// </summary>
[Trait("Area", "auth")]
public class VerifyOtpCommandValidatorTests
{
    private static ApiValidationAnswer Validate(string phone, string code = "123456") =>
        ApiValidation.Run(new VerifyOtpCommandValidator(new PhoneNormalizer(), new PlatformSettings()),
            new VerifyOtpCommand(phone, code));

    [Theory]
    [InlineData("01001234567")]
    [InlineData("+201001234567")]
    [InlineData("010 0123 4567")]
    public void A_valid_phone_passes(string phone)
    {
        Validate(phone).IsValid.ShouldBeTrue();
    }

    [Theory]
    [InlineData(null)]
    [InlineData("123")]
    [InlineData("phone")]
    public void An_invalid_phone_is_invalid_phone_on_phone(string phone)
    {
        Validate(phone).Errors.ShouldBe([new ApiFieldError("invalidPhone", "phone")]);
    }

    [Theory]
    [InlineData(null)]
    [InlineData("x")]
    public void The_code_is_not_a_validation_error(string code)
    {
        Validate("01001234567", code).IsValid.ShouldBeTrue();
    }
}
