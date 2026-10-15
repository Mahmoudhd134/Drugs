using ClinicHub.Application.Features.Access.StaffMembers.Commands.UpdateStaff;
using ClinicHub.UnitTests.TestSupport;
using Shouldly;

namespace ClinicHub.UnitTests.Access.StaffMembers;

/// <summary>
/// <c>PUT …/staff/{id}</c> validation (platform-admin tech § staff): full name, the active flag (required: a missing value
/// is <c>invalidRequest</c>, never "deactivate"), at least one role.
/// </summary>
[Trait("Area", "admin")]
public class UpdateStaffCommandValidatorTests
{
    private static ApiValidationAnswer Validate(string fullName, bool? isActive, List<int> roleIds) =>
        ApiValidation.Run(new UpdateStaffCommandValidator(), new UpdateStaffCommand(9, fullName, isActive, roleIds));

    [Theory]
    [InlineData(true)]
    [InlineData(false)]
    public void A_name_a_flag_and_a_role_is_valid(bool isActive)
    {
        Validate("Sara", isActive, [1, 2]).IsValid.ShouldBeTrue();
    }

    [Fact]
    public void A_missing_active_flag_is_an_invalid_request()
    {
        Validate("Sara", null, [1]).Errors.ShouldBe([new ApiFieldError("invalidRequest", "isActive")]);
    }

    [Fact]
    public void Name_rules_apply_to_the_full_name()
    {
        Validate("", true, [1]).Errors.ShouldBe([new ApiFieldError("nameRequired", "fullName")]);
        Validate("a\nb", true, [1]).Errors.ShouldBe([new ApiFieldError("nameInvalid", "fullName")]);
        Validate(Text.OfLength(256), true, [1]).IsValid.ShouldBeTrue();
        Validate(Text.OfLength(257), true, [1]).Errors.ShouldBe([new ApiFieldError("nameTooLong", "fullName")]);
    }

    [Fact]
    public void At_least_one_role_is_required()
    {
        Validate("Sara", true, []).Errors.ShouldBe([new ApiFieldError("rolesRequired", "roleIds")]);
        Validate("Sara", false, null).Errors.ShouldBe([new ApiFieldError("rolesRequired", "roleIds")]);
    }

    [Fact]
    public void All_errors_are_reported_in_the_form_order()
    {
        Validate(null, null, null).Errors.ShouldBe([
            new ApiFieldError("nameRequired", "fullName"),
            new ApiFieldError("invalidRequest", "isActive"),
            new ApiFieldError("rolesRequired", "roleIds"),
        ]);
    }
}
