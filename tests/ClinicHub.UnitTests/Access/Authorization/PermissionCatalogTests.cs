using ClinicHub.Application.Features.Access.Authorization;
using Shouldly;

namespace ClinicHub.UnitTests.Access.Authorization;

/// <summary>
/// The permission catalog (access tech § Backend and § API): 11 keys in declaration order, modules, direct requirements,
/// and the transitive closure <c>WithRequirements</c>.
/// </summary>
[Trait("Area", "access")]
public class PermissionCatalogTests
{
    private static readonly string[] CatalogOrder =
    [
        "drugs.list", "drugs.details", "drugs.create", "drugs.update", "drugs.delete",
        "groups.list", "groups.details", "groups.create", "groups.update", "groups.delete",
        "prescriptions.create",
    ];

    [Fact]
    public void The_catalog_has_the_11_keys_in_order()
    {
        PermissionCatalog.All.Select(p => p.Key).ShouldBe(CatalogOrder);
        PermissionCatalog.Keys.ShouldBe(CatalogOrder, ignoreOrder: true);
    }

    [Fact]
    public void Each_key_is_resource_dot_action_with_its_module()
    {
        foreach (var p in PermissionCatalog.All)
        {
            p.Key.ShouldBe($"{p.Resource}.{p.Action}");
            p.Module.ShouldBe(p.Resource == "prescriptions" ? "prescription" : "catalog", p.Key);
        }
    }

    [Theory]
    [InlineData("drugs.list")]
    [InlineData("drugs.details", "drugs.list")]
    [InlineData("drugs.create", "drugs.list")]
    [InlineData("drugs.update", "drugs.details")]
    [InlineData("drugs.delete", "drugs.details")]
    [InlineData("groups.list")]
    [InlineData("groups.details", "groups.list")]
    [InlineData("groups.create", "groups.list", "drugs.list")]
    [InlineData("groups.update", "groups.details", "drugs.list")]
    [InlineData("groups.delete", "groups.list")]
    [InlineData("prescriptions.create", "drugs.list")]
    public void Requires_lists_the_direct_requirements_only(string key, params string[] requires)
    {
        PermissionCatalog.All.Single(p => p.Key == key).Requires.ShouldBe(requires, ignoreOrder: true);
    }

    [Fact]
    public void By_resource_groups_in_declaration_order()
    {
        var groups = PermissionCatalog.ByResource();

        groups.Select(g => g.Key).ShouldBe(["drugs", "groups", "prescriptions"]);
        groups[0].Select(p => p.Action).ShouldBe(["list", "details", "create", "update", "delete"]);
        groups[2].Select(p => p.Action).ShouldBe(["create"]);
    }

    [Theory]
    [InlineData("drugs.list", true)]
    [InlineData("prescriptions.create", true)]
    [InlineData("drugs.archive", false)]
    [InlineData("", false)]
    [InlineData(null, false)]
    public void Is_known_only_for_catalog_keys(string key, bool known)
    {
        PermissionCatalog.IsKnown(key).ShouldBe(known);
    }

    [Theory]
    [InlineData(new[] { "drugs.update" }, new[] { "drugs.update", "drugs.details", "drugs.list" })]
    [InlineData(new[] { "groups.update" }, new[] { "groups.update", "groups.details", "groups.list", "drugs.list" })]
    [InlineData(new[] { "drugs.delete", "groups.create" },
        new[] { "drugs.delete", "drugs.details", "drugs.list", "groups.create", "groups.list" })]
    [InlineData(new[] { "prescriptions.create" }, new[] { "prescriptions.create", "drugs.list" })]
    [InlineData(new[] { "drugs.list", "drugs.list" }, new[] { "drugs.list" })]
    [InlineData(new[] { "nope.x", "drugs.create" }, new[] { "drugs.create", "drugs.list" })]
    [InlineData(new string[0], new string[0])]
    public void With_requirements_adds_every_requirement_transitively_and_drops_unknown_keys(string[] keys, string[] expected)
    {
        PermissionCatalog.WithRequirements(keys).ShouldBe(expected, ignoreOrder: true);
    }

    [Fact]
    public void With_requirements_of_every_key_is_the_whole_catalog()
    {
        PermissionCatalog.WithRequirements(CatalogOrder).Count.ShouldBe(11);
    }
}
