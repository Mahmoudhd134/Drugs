using ClinicHub.Application.Features.Access.Authorization;
using Shouldly;

namespace ClinicHub.UnitTests.Access.Authorization;

/// <summary><c>PermissionSet</c> (access tech § Backend): expanded keys, the checks, and the Owner's "all".</summary>
[Trait("Area", "access")]
public class PermissionSetTests
{
    [Fact]
    [Trait("Case", "ACC-005")]
    [Trait("Tier", "Smoke")]
    public void Of_expands_the_requirements_transitively()
    {
        PermissionSet.Of(["drugs.update"]).Keys.ShouldBe(["drugs.update", "drugs.details", "drugs.list"], ignoreOrder: true);
        PermissionSet.Of(["groups.update"]).Keys
            .ShouldBe(["groups.update", "groups.details", "groups.list", "drugs.list"], ignoreOrder: true);
    }

    [Fact]
    [Trait("Case", "ACC-005")]
    public void Of_drops_keys_no_longer_in_the_catalog()
    {
        PermissionSet.Of(["drugs.archive", "drugs.list"]).Keys.ShouldBe(["drugs.list"]);
        PermissionSet.Of(["drugs.archive"]).Keys.ShouldBeEmpty();
    }

    [Fact]
    [Trait("Case", "ACC-006")]
    public void Has_answers_for_one_key()
    {
        var set = PermissionSet.Of(["drugs.update"]);

        set.Has("drugs.update").ShouldBeTrue();
        set.Has("drugs.details").ShouldBeTrue("required by drugs.update");
        set.Has("drugs.delete").ShouldBeFalse();
        set.Has("groups.list").ShouldBeFalse();
        set.Has("nope.x").ShouldBeFalse();
    }

    [Fact]
    [Trait("Case", "ACC-006")]
    public void Has_all_needs_every_key_and_has_any_one()
    {
        var set = PermissionSet.Of(["drugs.create"]);

        set.HasAll("drugs.create", "drugs.list").ShouldBeTrue();
        set.HasAll("drugs.create", "drugs.delete").ShouldBeFalse();
        set.HasAll().ShouldBeTrue("nothing asked");
        set.HasAny("drugs.delete", "drugs.list").ShouldBeTrue();
        set.HasAny("drugs.delete", "groups.list").ShouldBeFalse();
        set.HasAny().ShouldBeFalse("nothing asked");
    }

    [Fact]
    [Trait("Case", "ACC-006")]
    public void To_list_is_in_catalog_order()
    {
        PermissionSet.Of(["prescriptions.create", "groups.delete", "drugs.update"]).ToList().ShouldBe([
            "drugs.list", "drugs.details", "drugs.update", "groups.list", "groups.delete", "prescriptions.create",
        ]);
    }

    [Fact]
    [Trait("Case", "ACC-006")]
    [Trait("Tier", "Smoke")]
    public void All_is_every_permission_for_the_owner()
    {
        var all = PermissionSet.All;

        all.IsAll.ShouldBeTrue();
        all.ToList().ShouldBe(PermissionCatalog.All.Select(p => p.Key).ToList());
        all.ToList().Count.ShouldBe(11);
        all.HasAll([.. PermissionCatalog.Keys]).ShouldBeTrue();
        all.Has("nope.x").ShouldBeFalse("only catalog keys");
    }

    [Fact]
    [Trait("Case", "ACC-006")]
    public void A_role_set_is_never_all_even_with_every_key()
    {
        var everyKey = PermissionSet.Of(PermissionCatalog.Keys);

        everyKey.IsAll.ShouldBeFalse();
        everyKey.ToList().Count.ShouldBe(11);
    }

    [Fact]
    [Trait("Case", "ACC-006")]
    public void None_has_nothing()
    {
        var none = PermissionSet.None;

        none.IsAll.ShouldBeFalse();
        none.Keys.ShouldBeEmpty();
        none.ToList().ShouldBeEmpty();
        none.HasAny("drugs.list").ShouldBeFalse();
        PermissionSet.Of([]).ToList().ShouldBeEmpty();
    }
}
