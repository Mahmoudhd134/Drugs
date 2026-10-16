using ClinicHub.Application.Features.Access.Authorization;
using ClinicHub.UnitTests.TestSupport;
using Shouldly;

namespace ClinicHub.UnitTests.Access.Authorization;

/// <summary>
/// The SPA's copy of the permission catalog against the backend's own (access tech § Frontend: <c>permissions.ts</c>
/// "mirrors the backend <c>Permissions</c> class; keep in sync"; access business § القواعد: every permission has its
/// label). The Vitest twins compare with a hand-written TypeScript list; only this side reads the real catalog, so a
/// key added to <c>Permissions.cs</c> and forgotten in the SPA fails here.
/// </summary>
[Trait("Area", "access")]
public class SpaPermissionMirrorTests
{
    [Fact]
    [Trait("Case", "ACC-008")]
    public void Permissions_ts_holds_exactly_the_backend_keys()
    {
        var spaKeys = SpaSources.PermissionKeys();

        spaKeys.ShouldBeUnique();
        spaKeys.ShouldBe(PermissionCatalog.Keys, ignoreOrder: true, $"permissions.ts vs Permissions.cs ({SpaSources.ReaderHint})");
        spaKeys.Count.ShouldBe(11);
    }

    [Theory]
    [Trait("Case", "ACC-009")]
    [InlineData("en.ts")]
    [InlineData("ar.ts")]
    public void Every_backend_permission_resource_and_module_has_its_label(string localeFile)
    {
        var texts = SpaSources.LocaleKeys(localeFile);

        foreach (var permission in PermissionCatalog.All)
        {
            var where = $"{localeFile} ({SpaSources.ReaderHint})";
            texts.ShouldContain($"permissions.{permission.Key}", where);
            texts.ShouldContain($"permissionResources.{permission.Resource}", where);
            texts.ShouldContain($"permissionModules.{permission.Module}", where);
        }
    }

    [Fact]
    public void The_locale_reader_finds_the_same_keys_in_both_files()
    {
        // The reader itself: both files have the same keys (they are typed alike) and the known ones are found
        var en = SpaSources.LocaleKeys("en.ts");
        var ar = SpaSources.LocaleKeys("ar.ts");

        en.Count.ShouldBeGreaterThan(300);
        ar.ShouldBe(en, ignoreOrder: true);
        en.ShouldContain("app.name");
        en.ShouldContain("errors.notFound");
        en.ShouldContain("permissions.drugs.list");
        en.ShouldContain("permissions.prescriptions.create");
        en.ShouldNotContain("permissions.drugs");
    }
}
