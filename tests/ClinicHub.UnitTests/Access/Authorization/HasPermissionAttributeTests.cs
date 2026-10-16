using ClinicHub.Api.Features.Access;
using ClinicHub.Api.Features.Identity;
using ClinicHub.Application.Features.Access;
using Shouldly;

namespace ClinicHub.UnitTests.Access.Authorization;

/// <summary>
/// <c>[HasPermission]</c> (access tech § Backend): it implies the clinic-context policy and adds the permission
/// requirement; an unknown key throws when the endpoints are built, so a typo can't leave an endpoint unguarded.
/// </summary>
[Trait("Area", "access")]
public class HasPermissionAttributeTests
{
    [Fact]
    public void A_known_key_needs_the_clinic_context_policy_and_that_permission()
    {
        var attribute = new HasPermissionAttribute(Permissions.Drugs.Create);

        attribute.Policy.ShouldBe(AuthPolicies.ClinicContext);
        attribute.Permission.ShouldBe("drugs.create");
        attribute.GetRequirements().ShouldHaveSingleItem()
            .ShouldBeOfType<PermissionRequirement>().Permission.ShouldBe("drugs.create");
    }

    [Theory]
    [InlineData("drugs.archive")]
    [InlineData("")]
    public void An_unknown_key_throws(string key)
    {
        var error = Should.Throw<ArgumentException>(() => new HasPermissionAttribute(key));

        error.ParamName.ShouldBe("permission");
    }
}
