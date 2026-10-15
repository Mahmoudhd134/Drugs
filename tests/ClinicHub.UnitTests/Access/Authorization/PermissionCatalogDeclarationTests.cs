using ClinicHub.Application.Features.Access;
using ClinicHub.Application.Features.Access.Authorization;
using Shouldly;

namespace ClinicHub.UnitTests.Access.Authorization;

/// <summary>
/// ACC-007 (access tech § Backend): the catalog is built from the declarations and a bad one throws, so the app refuses
/// to start (the message names the bad key or class). Each container below is a small stand-in for
/// <see cref="Permissions"/>.
/// </summary>
[Trait("Area", "access")]
public class PermissionCatalogDeclarationTests
{
    [Fact]
    public void A_good_declaration_builds_in_order_with_modules_and_requirements()
    {
        var catalog = PermissionCatalog.Build(typeof(Good));

        catalog.Select(p => (p.Key, p.Module, p.Resource, p.Action)).ShouldBe(
        [
            ("drugs.list", "catalog", "drugs", "list"),
            ("drugs.update", "catalog", "drugs", "update"),
            ("prescriptions.create", "prescription", "prescriptions", "create"),
        ]);
        catalog[1].Requires.ShouldBe(["drugs.list"]);
    }

    [Fact]
    [Trait("Case", "ACC-007")]
    public void A_key_that_is_not_resource_dot_action_throws()
    {
        Should.Throw<InvalidOperationException>(() => PermissionCatalog.Build(typeof(NoDot)))
            .Message.ShouldContain("'drugs'");
        Should.Throw<InvalidOperationException>(() => PermissionCatalog.Build(typeof(TwoDots)))
            .Message.ShouldContain("'drugs.list.all'");
        Should.Throw<InvalidOperationException>(() => PermissionCatalog.Build(typeof(UpperCase)))
            .Message.ShouldContain("'drugs.List'");
    }

    [Fact]
    [Trait("Case", "ACC-007")]
    public void A_duplicate_key_throws()
    {
        Should.Throw<InvalidOperationException>(() => PermissionCatalog.Build(typeof(Duplicate)))
            .Message.ShouldContain("'drugs.list'");
    }

    [Fact]
    [Trait("Case", "ACC-007")]
    public void An_unknown_requirement_or_one_on_itself_throws()
    {
        Should.Throw<InvalidOperationException>(() => PermissionCatalog.Build(typeof(UnknownRequirement)))
            .Message.ShouldContain("'drugs.nope'");
        Should.Throw<InvalidOperationException>(() => PermissionCatalog.Build(typeof(RequiresItself)))
            .Message.ShouldContain("'drugs.list'");
    }

    [Fact]
    [Trait("Case", "ACC-007")]
    public void A_resource_class_without_a_module_throws()
    {
        Should.Throw<InvalidOperationException>(() => PermissionCatalog.Build(typeof(NoModule)))
            .Message.ShouldContain("Drugs");
        Should.Throw<InvalidOperationException>(() => PermissionCatalog.Build(typeof(BlankModule)))
            .Message.ShouldContain("Drugs");
    }

    [Fact]
    [Trait("Case", "ACC-007")]
    public void A_key_whose_prefix_is_not_its_class_throws()
    {
        Should.Throw<InvalidOperationException>(() => PermissionCatalog.Build(typeof(WrongClass)))
            .Message.ShouldContain("'groups.list'");
    }

    public static class Good
    {
        [PermissionModule("catalog")]
        public static class Drugs
        {
            public const string List = "drugs.list";
            [Requires(List)] public const string Update = "drugs.update";
            // Not a permission: only public string constants count
            public static readonly string NotAConstant = "drugs.ignored";
        }

        [PermissionModule("prescription")]
        public static class Prescriptions
        {
            public const string Create = "prescriptions.create";
        }
    }

    public static class NoDot
    {
        [PermissionModule("catalog")]
        public static class Drugs
        {
            public const string List = "drugs";
        }
    }

    public static class TwoDots
    {
        [PermissionModule("catalog")]
        public static class Drugs
        {
            public const string List = "drugs.list.all";
        }
    }

    public static class UpperCase
    {
        [PermissionModule("catalog")]
        public static class Drugs
        {
            public const string List = "drugs.List";
        }
    }

    public static class Duplicate
    {
        [PermissionModule("catalog")]
        public static class Drugs
        {
            public const string List = "drugs.list";
            public const string Again = "drugs.list";
        }
    }

    public static class UnknownRequirement
    {
        [PermissionModule("catalog")]
        public static class Drugs
        {
            public const string List = "drugs.list";
            [Requires("drugs.nope")] public const string Update = "drugs.update";
        }
    }

    public static class RequiresItself
    {
        [PermissionModule("catalog")]
        public static class Drugs
        {
            [Requires("drugs.list")] public const string List = "drugs.list";
        }
    }

    public static class NoModule
    {
        public static class Drugs
        {
            public const string List = "drugs.list";
        }
    }

    public static class BlankModule
    {
        [PermissionModule(" ")]
        public static class Drugs
        {
            public const string List = "drugs.list";
        }
    }

    public static class WrongClass
    {
        [PermissionModule("catalog")]
        public static class Drugs
        {
            public const string List = "groups.list";
        }
    }
}
