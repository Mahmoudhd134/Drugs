using ClinicHub.Application.Features.Access.Roles.Commands.CreateRole;
using ClinicHub.UnitTests.TestSupport;
using Shouldly;

namespace ClinicHub.UnitTests.Access.Roles;

/// <summary>
/// <c>POST …/roles</c> validation (platform-admin tech § roles/staff): name (role limit 100), then the permissions (a
/// missing list is <c>invalidRequest</c>; unknown keys give one <c>unknownPermission</c>).
/// </summary>
[Trait("Area", "admin")]
public class CreateRoleCommandValidatorTests
{
    private static ApiValidationAnswer Validate(string name, List<string> permissions) =>
        ApiValidation.Run(new CreateRoleCommandValidator(), new CreateRoleCommand(name, permissions));

    [Fact]
    public void A_role_with_a_name_and_known_keys_is_valid()
    {
        Validate("Editors", ["drugs.update", "groups.list"]).IsValid.ShouldBeTrue();
        Validate("قراءة فقط", ["drugs.list"]).IsValid.ShouldBeTrue();
    }

    [Fact]
    public void A_role_that_grants_nothing_is_valid()
    {
        Validate("Nothing", []).IsValid.ShouldBeTrue();
    }

    [Fact]
    public void Repeated_keys_are_valid()
    {
        Validate("Editors", ["drugs.list", "drugs.list"]).IsValid.ShouldBeTrue();
    }

    [Fact]
    public void A_missing_permission_list_is_an_invalid_request()
    {
        Validate("Editors", null).Errors.ShouldBe([new ApiFieldError("invalidRequest", "permissions")]);
    }

    [Fact]
    public void Unknown_keys_give_one_error()
    {
        Validate("Editors", ["nope.x"]).Errors.ShouldBe([new ApiFieldError("unknownPermission", "permissions")]);
        Validate("Editors", ["nope.x", "drugs.list", "other.y"])
            .Errors.ShouldBe([new ApiFieldError("unknownPermission", "permissions")]);
    }

    [Theory]
    [InlineData("  ", "nameRequired")]
    [InlineData("a\0b", "nameInvalid")]
    [InlineData("a\u202Eb", "nameInvalid")]
    public void Name_errors_are_on_the_name(string name, string code)
    {
        Validate(name, []).Errors.ShouldBe([new ApiFieldError(code, "name")]);
    }

    [Fact]
    public void Role_names_are_at_most_100_characters()
    {
        Validate(Text.OfLength(100), []).IsValid.ShouldBeTrue();
        Validate(Text.OfLength(101), []).Errors.ShouldBe([new ApiFieldError("nameTooLong", "name")]);
    }

    [Fact]
    public void The_owner_label_is_not_a_validation_error()
    {
        // roleNameTaken is a 409 from the handler (it also compares with the clinic's roles)
        Validate("المالك", []).IsValid.ShouldBeTrue();
    }

    [Fact]
    public void Name_is_reported_before_the_permissions()
    {
        var answer = Validate("", ["nope.x"]);

        answer.Code.ShouldBe("nameRequired");
        answer.Errors.ShouldBe([
            new ApiFieldError("nameRequired", "name"),
            new ApiFieldError("unknownPermission", "permissions"),
        ]);
    }
}
