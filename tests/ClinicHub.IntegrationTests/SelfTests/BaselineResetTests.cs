using ClinicHub.Application.Features.Catalog.Categories;
using ClinicHub.IntegrationTests.Harness.Databases;
using ClinicHub.IntegrationTests.Harness.Hosting;
using Microsoft.EntityFrameworkCore;
using Shouldly;

namespace ClinicHub.IntegrationTests.SelfTests;

[CollectionDefinition(Name)]
public sealed class InfraBaselineCollection : ICollectionFixture<AppFixture>
{
    public const string Name = "infra-baseline";
}

/// <summary>What every test class of a loaded collection finds (design M1.7 D12): the imported catalog, nothing else.</summary>
internal static class LoadedCatalog
{
    public static async Task ShouldHoldExactlyTheBaselineAsync(AppFixture app)
    {
        var baseline = TestRun.Baseline;
        baseline.ShouldNotBeNull("the run records its baseline after loading the catalog");
        (await app.QueryDbAsync(db => db.Clinics.Select(c => c.IsTemplate).ToListAsync())).ShouldBe([true]);
        (await app.QueryDbAsync(db => db.Drugs.IgnoreQueryFilters().CountAsync(d => d.ClinicId != null))).ShouldBe(0, "own drugs");
        (await app.QueryDbAsync(db => db.Drugs.IgnoreQueryFilters().CountAsync(d => d.Id > baseline.MaxDrugId))).ShouldBe(0, "test-created drugs");
        (await app.QueryDbAsync(db => db.Drugs.IgnoreQueryFilters().CountAsync(d => d.ClinicId == null))).ShouldBe(baseline.SharedCount);
        (await app.QueryDbAsync(db => db.Drugs.IgnoreQueryFilters().CountAsync(d => d.IsWithdrawn))).ShouldBe(0, "withdrawn drugs");
        (await app.QueryDbAsync(db => db.Categories.CountAsync())).ShouldBe(baseline.MaxCategoryId);
        (await app.QueryDbAsync(db => db.Categories.MaxAsync(c => c.Id))).ShouldBe(baseline.MaxCategoryId);
        (await app.QueryDbAsync(db => db.SubCategories.CountAsync())).ShouldBe(baseline.MaxSubCategoryId);
        (await app.QueryDbAsync(db => db.SubCategories.MaxAsync(c => c.Id))).ShouldBe(baseline.MaxSubCategoryId);
        (await app.QueryDbAsync(db => db.Protocols.IgnoreQueryFilters().CountAsync())).ShouldBe(0);
        (await app.QueryDbAsync(db => db.ProtocolItems.IgnoreQueryFilters().CountAsync())).ShouldBe(0);
        (await BaselineGuard.CheckAsync(app.Factory.ConnectionString, baseline, "probe")).ShouldBeNull();
    }

    /// <summary>
    /// Leaves every kind of catalog row behind: clinics (one deleted), own drugs (one in a test category), protocol lines on
    /// an imported and on a test shared drug, test shared drugs (one withdrawn), a test category with a subcategory and a
    /// test subcategory under an imported category.
    /// </summary>
    public static async Task DirtyAsync(AppFixture app)
    {
        var data = app.Data;
        var clinic = await data.Clinic();
        var deleted = await data.Clinic();
        var imported = await data.Shared("VIGAMOX 0.5% EYE DROPS 5 ML");
        var shared = await data.SharedDrug();
        await data.SharedDrug().Withdrawn();
        var category = await data.Category();
        var sub = await data.SubCategory(category.Id);
        await data.SubCategory(CategoryIds.Eye);
        var own = await data.Drug(clinic).InCategory(category.Id, sub.Id);
        await data.Protocol(clinic).With(imported.Id).With(shared.Id).With(own);
        await data.Drug(deleted);
        await data.DeleteClinicAsync(deleted);
        await app.Login.OwnerAsync(clinic);
    }
}

// Two classes in one collection, in either order: the second one proves the reset between classes keeps exactly the
// baseline (Respawn never truncates Clinics, so nothing cascades into Drugs)

[Collection(InfraBaselineCollection.Name)]
[Trait("Area", "infra")]
public class BaselineResetProbeOneTests(AppFixture app) : IntegrationTest(app)
{
    [Fact]
    [Trait("Case", "CAT-224")]
    public async Task A_class_starts_on_exactly_the_baseline()
    {
        await LoadedCatalog.ShouldHoldExactlyTheBaselineAsync(App);
        await LoadedCatalog.DirtyAsync(App);
    }
}

[Collection(InfraBaselineCollection.Name)]
[Trait("Area", "infra")]
public class BaselineResetProbeTwoTests(AppFixture app) : IntegrationTest(app)
{
    [Fact]
    [Trait("Case", "CAT-224")]
    public async Task A_class_starts_on_exactly_the_baseline()
    {
        await LoadedCatalog.ShouldHoldExactlyTheBaselineAsync(App);
        await LoadedCatalog.DirtyAsync(App);
    }
}

[Collection(InfraBaselineCollection.Name)]
[Trait("Area", "infra")]
public class BaselineResetTests(AppFixture app) : IntegrationTest(app)
{
    [Fact]
    [Trait("Case", "CAT-224")]
    public async Task A_reset_removes_every_test_row_and_keeps_exactly_the_baseline()
    {
        await LoadedCatalog.DirtyAsync(App);

        await App.ResetAsync();

        await LoadedCatalog.ShouldHoldExactlyTheBaselineAsync(App);
    }
}
