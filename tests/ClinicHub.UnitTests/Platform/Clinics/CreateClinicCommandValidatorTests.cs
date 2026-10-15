using ClinicHub.Application.Common.Settings;
using ClinicHub.Application.Features.Identity.Users;
using ClinicHub.Application.Features.Platform.Clinics.Commands.CreateClinic;
using ClinicHub.UnitTests.TestSupport;
using Shouldly;

namespace ClinicHub.UnitTests.Platform.Clinics;

/// <summary>
/// <c>POST /admin/clinics</c> validation (platform-admin tech § API): clinic name, owner phone, owner name, in the
/// form's order; both names limited to 256.
/// </summary>
[Trait("Area", "admin")]
public class CreateClinicCommandValidatorTests
{
    private static ApiValidationAnswer Validate(string name, CreateClinicOwner owner) =>
        ApiValidation.Run(new CreateClinicCommandValidator(new PhoneNormalizer(), new PlatformSettings()),
            new CreateClinicCommand(name, owner));

    private static CreateClinicOwner Owner(string phone = "01001234567", string fullName = "د. أحمد") => new(phone, fullName);

    [Fact]
    public void A_clinic_with_a_name_and_an_owner_is_valid()
    {
        Validate("عيادة النور", Owner()).IsValid.ShouldBeTrue();
        Validate("Clinic A", Owner("+201001234567", "Ahmed")).IsValid.ShouldBeTrue();
        Validate("Clinic A", Owner("0223456789")).IsValid.ShouldBeTrue("landlines are accepted");
    }

    [Theory]
    [InlineData("   ", "nameRequired")]
    [InlineData(Text.ZeroWidthSpace + " " + Text.WordJoiner + Text.ByteOrderMark, "nameRequired")]
    [InlineData("a\0b", "nameInvalid")]
    [InlineData("a\nb", "nameInvalid")]
    [InlineData("a\u2028b", "nameInvalid")]
    [InlineData("a\u202Eb", "nameInvalid")]
    public void Clinic_name_errors_are_on_the_name(string name, string code)
    {
        Validate(name, Owner()).Errors.ShouldBe([new ApiFieldError(code, "name")]);
    }

    [Fact]
    public void A_trailing_line_break_is_trimmed()
    {
        Validate("Clinic A\n", Owner()).IsValid.ShouldBeTrue();
    }

    [Fact]
    public void Names_are_at_most_256_characters()
    {
        Validate(Text.OfLength(256), Owner(fullName: Text.OfLength(256))).IsValid.ShouldBeTrue();
        Validate(Text.OfLength(257), Owner()).Errors.ShouldBe([new ApiFieldError("nameTooLong", "name")]);
        Validate("A", Owner(fullName: Text.OfLength(257))).Errors.ShouldBe([new ApiFieldError("nameTooLong", "owner.fullName")]);
    }

    [Theory]
    [InlineData("123")]
    [InlineData(null)]
    public void An_invalid_owner_phone_is_on_owner_phone(string phone)
    {
        Validate("A", Owner(phone)).Errors.ShouldBe([new ApiFieldError("invalidPhone", "owner.phone")]);
    }

    [Theory]
    [InlineData(" ", "nameRequired")]
    [InlineData(null, "nameRequired")]
    [InlineData("a\u202Eb", "nameInvalid")]
    public void Owner_name_errors_are_on_owner_full_name(string fullName, string code)
    {
        Validate("A", Owner(fullName: fullName)).Errors.ShouldBe([new ApiFieldError(code, "owner.fullName")]);
    }

    [Fact]
    public void A_missing_owner_is_an_invalid_request()
    {
        Validate("A", null).Errors.ShouldBe([new ApiFieldError("invalidRequest", "owner")]);
    }

    [Fact]
    public void All_errors_are_reported_in_the_form_order()
    {
        var answer = Validate(" ", Owner("123", " "));

        answer.Code.ShouldBe("nameRequired");
        answer.Errors.ShouldBe([
            new ApiFieldError("nameRequired", "name"),
            new ApiFieldError("invalidPhone", "owner.phone"),
            new ApiFieldError("nameRequired", "owner.fullName"),
        ]);
    }
}
