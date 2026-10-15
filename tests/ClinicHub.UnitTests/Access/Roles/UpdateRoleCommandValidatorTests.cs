using ClinicHub.Application.Features.Access.Roles.Commands.UpdateRole;
using ClinicHub.UnitTests.TestSupport;
using Shouldly;

namespace ClinicHub.UnitTests.Access.Roles;

/// <summary><c>PUT …/roles/{id}</c> validation: like create (platform-admin tech § roles/staff).</summary>
[Trait("Area", "admin")]
public class UpdateRoleCommandValidatorTests
{
    private static ApiValidationAnswer Validate(string name, List<string> permissions) =>
        ApiValidation.Run(new UpdateRoleCommandValidator(), new UpdateRoleCommand(3, name, permissions));

    [Fact]
    public void A_role_with_a_name_and_known_keys_is_valid()
    {
        Validate("Doctor Plus", ["groups.update"]).IsValid.ShouldBeTrue();
        Validate("Doctor", []).IsValid.ShouldBeTrue();
    }

    [Fact]
    public void A_missing_permission_list_is_an_invalid_request()
    {
        Validate("Doctor", null).Errors.ShouldBe([new ApiFieldError("invalidRequest", "permissions")]);
    }

    [Fact]
    public void Unknown_keys_give_one_error()
    {
        Validate("Doctor", ["nope.x", "nope.y"]).Errors.ShouldBe([new ApiFieldError("unknownPermission", "permissions")]);
    }

    [Fact]
    public void Name_rules_apply_with_the_role_limit()
    {
        Validate(" ", []).Errors.ShouldBe([new ApiFieldError("nameRequired", "name")]);
        Validate("a\u2069b", []).Errors.ShouldBe([new ApiFieldError("nameInvalid", "name")]);
        Validate(Text.OfLength(100), []).IsValid.ShouldBeTrue();
        Validate(Text.OfLength(101), []).Errors.ShouldBe([new ApiFieldError("nameTooLong", "name")]);
    }

    [Fact]
    public void Name_is_reported_before_the_permissions()
    {
        Validate(null, null).Errors.ShouldBe([
            new ApiFieldError("nameRequired", "name"),
            new ApiFieldError("invalidRequest", "permissions"),
        ]);
    }
}
