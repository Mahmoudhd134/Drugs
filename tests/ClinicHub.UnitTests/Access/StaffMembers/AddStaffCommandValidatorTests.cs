using ClinicHub.Application.Common.Settings;
using ClinicHub.Application.Features.Access.StaffMembers.Commands.AddStaff;
using ClinicHub.Application.Features.Identity.Users;
using ClinicHub.UnitTests.TestSupport;
using Shouldly;

namespace ClinicHub.UnitTests.Access.StaffMembers;

/// <summary>
/// <c>POST …/staff</c> validation (platform-admin tech § staff): phone (like login, local numbers in EG), full name
/// (limit 256), at least one role, in that order.
/// </summary>
[Trait("Area", "admin")]
public class AddStaffCommandValidatorTests
{
    private static ApiValidationAnswer Validate(string phone, string fullName, List<int> roleIds) =>
        ApiValidation.Run(new AddStaffCommandValidator(new PhoneNormalizer(), new PlatformSettings()),
            new AddStaffCommand(phone, fullName, roleIds));

    [Theory]
    [InlineData("01001234567")]
    [InlineData("+201001234567")]
    [InlineData("0223456789")]
    public void A_valid_phone_name_and_role_is_valid(string phone)
    {
        Validate(phone, "د. سارة", [1]).IsValid.ShouldBeTrue();
    }

    [Theory]
    [InlineData("123")]
    [InlineData("")]
    [InlineData(null)]
    [InlineData("phone")]
    public void An_invalid_phone_is_reported_on_the_phone(string phone)
    {
        Validate(phone, "Sara", [1]).Errors.ShouldBe([new ApiFieldError("invalidPhone", "phone")]);
    }

    [Theory]
    [InlineData(" ", "nameRequired")]
    [InlineData("a\0b", "nameInvalid")]
    [InlineData("a\u202Eb", "nameInvalid")]
    public void Name_errors_are_on_the_full_name(string name, string code)
    {
        Validate("01001234567", name, [1]).Errors.ShouldBe([new ApiFieldError(code, "fullName")]);
    }

    [Fact]
    public void Full_name_is_at_most_256_characters()
    {
        Validate("01001234567", Text.OfLength(256), [1]).IsValid.ShouldBeTrue();
        Validate("01001234567", Text.OfLength(257), [1]).Errors.ShouldBe([new ApiFieldError("nameTooLong", "fullName")]);
    }

    [Fact]
    public void At_least_one_role_is_required()
    {
        Validate("01001234567", "Sara", []).Errors.ShouldBe([new ApiFieldError("rolesRequired", "roleIds")]);
        Validate("01001234567", "Sara", null).Errors.ShouldBe([new ApiFieldError("rolesRequired", "roleIds")]);
        Validate("01001234567", "Sara", [4, 4]).IsValid.ShouldBeTrue("duplicates are ignored later");
    }

    [Fact]
    public void All_errors_are_reported_in_the_form_order()
    {
        var answer = Validate("123", " ", []);

        answer.Code.ShouldBe("invalidPhone");
        answer.Errors.ShouldBe([
            new ApiFieldError("invalidPhone", "phone"),
            new ApiFieldError("nameRequired", "fullName"),
            new ApiFieldError("rolesRequired", "roleIds"),
        ]);
    }
}
