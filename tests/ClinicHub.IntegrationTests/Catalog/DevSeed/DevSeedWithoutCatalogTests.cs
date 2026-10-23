using ClinicHub.Application.Common.Abstractions;
using ClinicHub.Infrastructure.Platform;
using ClinicHub.IntegrationTests.Harness.Builders;
using ClinicHub.IntegrationTests.Harness.Databases;
using ClinicHub.IntegrationTests.Harness.Hosting;
using Microsoft.EntityFrameworkCore;
using ClinicHub.Application.Features.Catalog.Categories;
using ClinicHub.Domain.Catalog;
using ClinicHub.Infrastructure.Database;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Shouldly;

namespace ClinicHub.IntegrationTests.Catalog.DevSeed;

/// <summary>
/// The dev seed started before the shared catalog is loaded (design M1.7 § 9 M1.7b: "without the catalog loaded the
/// template sample is skipped with a warning naming the script"; D5: dev database reset, migrated, then loaded; CAT-223:
/// a fresh dev database ends with the demo clinics and the template's sample protocol VIGAMOX + one own drug). The
/// warning tells the developer to run the script, so a later start after the load must seed everything: the dev seed
/// stores nothing while the catalog is missing (T3 finding B1). In the migration collection: a bare copy (no catalog,
/// design D12), which this test loads itself; the variant app marks the database for a reset, which empties it again.
/// </summary>
[Collection(CatalogMigrationCollection.Name)]
[Trait("Area", "catalog")]
public class DevSeedWithoutCatalogTests(BareAppFixture app) : IntegrationTest(app)
{
    [Fact]
    [Trait("Case", "CAT-230")]
    public async Task A_dev_start_before_the_catalog_load_seeds_nothing_and_the_first_start_after_the_load_seeds_everything()
    {
        // The app as in Development (dev phones set) on a database without the catalog
        var logs = new CapturedLogs();
        await using var dev = DevApp(logs);
        (await App.QueryDbAsync(db => db.Drugs.IgnoreQueryFilters().AnyAsync(d => d.ClinicId == null)))
            .ShouldBeFalse("precondition: no shared catalog");

        await SeedAsync(dev);

        logs.Of<StartupSeeder>(LogLevel.Warning).ShouldBe([CatalogMissing], "the warning names the script");
        (await App.QueryDbAsync(db => db.Clinics.IgnoreQueryFilters().Where(c => !c.IsTemplate).Select(c => c.Name).ToListAsync()))
            .ShouldBeEmpty("no demo clinic while the catalog is missing (else a later start never seeds the template sample)");
        (await App.QueryDbAsync(db => db.Drugs.IgnoreQueryFilters().AnyAsync(d => d.ClinicId != null))).ShouldBeFalse("no own drug");
        (await App.QueryDbAsync(db => db.Protocols.IgnoreQueryFilters().AnyAsync())).ShouldBeFalse("no protocol");

        // The developer runs the script the warning names, then starts the app again
        await CatalogLoader.LoadAsync(App.Factory.ConnectionString);
        await SeedAsync(dev);

        var clinics = await App.QueryDbAsync(db => db.Clinics.IgnoreQueryFilters().Where(c => !c.IsTemplate).Select(c => c.Name).ToListAsync());
        clinics.ShouldBe([StartupSeeder.DemoClinicName, StartupSeeder.SecondDemoClinicName], ignoreOrder: true);
        var templateId = await App.QueryDbAsync(db => db.Clinics.IgnoreQueryFilters().Where(c => c.IsTemplate).Select(c => c.Id).SingleAsync());
        var vigamoxId = await App.QueryDbAsync(db => db.Drugs.IgnoreQueryFilters()
            .Where(d => d.ClinicId == null && d.Name == StartupSeeder.SampleSharedDrugName).Select(d => d.Id).SingleAsync());
        var templateLines = await App.QueryDbAsync(db => db.ProtocolItems.IgnoreQueryFilters()
            .Where(i => i.ClinicId == templateId).Select(i => i.DrugId).ToListAsync());
        templateLines.ShouldContain(vigamoxId, "the template's sample protocol holds VIGAMOX (shared)");
        var templateOwn = await App.QueryDbAsync(db => db.Drugs.IgnoreQueryFilters()
            .Where(d => d.ClinicId == templateId).Select(d => d.Id).ToListAsync());
        templateOwn.ShouldNotBeEmpty("the template sample's own drugs");
        templateLines.Count(templateOwn.Contains).ShouldBe(1, "and one own drug");
        var demoId = await App.QueryDbAsync(db => db.Clinics.IgnoreQueryFilters()
            .Where(c => c.Name == StartupSeeder.DemoClinicName).Select(c => c.Id).SingleAsync());
        (await App.QueryDbAsync(db => db.Drugs.IgnoreQueryFilters().CountAsync(d => d.ClinicId == demoId)))
            .ShouldBe(templateOwn.Count, "the demo clinic holds the template's copy");
    }

    [Theory]
    [Trait("Case", "CAT-230")]
    [InlineData(true)]
    [InlineData(false)]
    public async Task With_only_part_of_the_catalog_the_dev_seed_stores_nothing_and_warns(bool eyeCategory)
    {
        // Loaded = the «العيون» category and the shared VIGAMOX (platform-admin tech § Dev seed): here only one of them,
        // and another shared drug or category beside it
        var logs = new CapturedLogs();
        await using var dev = DevApp(logs);
        await AddPartialCatalogAsync(eyeCategory);

        await SeedAsync(dev);

        logs.Of<StartupSeeder>(LogLevel.Warning).ShouldBe([CatalogMissing]);
        (await App.QueryDbAsync(db => db.Clinics.IgnoreQueryFilters().CountAsync(c => !c.IsTemplate))).ShouldBe(0, "no demo clinic");
        (await App.QueryDbAsync(db => db.Drugs.IgnoreQueryFilters().AnyAsync(d => d.ClinicId != null))).ShouldBeFalse("no own drug");
        (await App.QueryDbAsync(db => db.Protocols.IgnoreQueryFilters().AnyAsync())).ShouldBeFalse("no protocol");
    }

    private const string CatalogMissing =
        "The shared drug catalog is not loaded: the development data is not seeded (run " + StartupSeeder.CatalogScript + ")";

    /// <summary>The «العيون» category with another shared drug, or the shared VIGAMOX in another category.</summary>
    private async Task AddPartialCatalogAsync(bool eyeCategory)
    {
        var categoryId = eyeCategory ? CategoryIds.Eye : CategoryIds.Eye + 9000;
        await using var scope = App.Factory.Services.CreateAsyncScope();
        using var _ = scope.ServiceProvider.GetRequiredService<IClinicScope>().UseSharedCatalog();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        db.Categories.Add(new Category { Id = categoryId, NameEn = $"Partial {categoryId}", NameAr = $"جزئي {categoryId}" });
        db.Drugs.Add(new Drug
        {
            Name = eyeCategory ? "ANOTHER EYE DROPS 5 ML" : StartupSeeder.SampleSharedDrugName,
            CategoryId = categoryId,
        });
        await db.SaveChangesAsync();
    }

    /// <summary>The app as in Development (dev phones set), its seeder's log captured.</summary>
    private ClinicHubFactory DevApp(CapturedLogs logs)
    {
        var level = CapturedLogs.LevelSetting<StartupSeeder>();
        var dev = App.CreateVariant(new Dictionary<string, string>
        {
            ["Platform:DevOwnerPhone"] = Unique.Phone(),
            ["Platform:DevAssistantPhone"] = Unique.Phone(),
            [level.Key] = level.Value,
        }, logs.Register);
        dev.Start();
        return dev;
    }

    private static async Task SeedAsync(ClinicHubFactory dev)
    {
        await using var scope = dev.Services.CreateAsyncScope();
        await scope.ServiceProvider.GetRequiredService<IStartupSeeder>().SeedAsync(isDevelopment: true);
    }
}
