using ClinicHub.IntegrationTests.Harness.Databases;
using ClinicHub.IntegrationTests.Harness.Hosting;
using Microsoft.EntityFrameworkCore;
using Shouldly;

namespace ClinicHub.IntegrationTests.SelfTests;

/// <summary>Two parallel test groups never see each other's data: each collection has its own database copy and app.</summary>
[Collection(InfraCollectionA.Name)]
[Trait("Area", "infra")]
public class CollectionIsolationTests(AppFixture app) : IntegrationTest(app)
{
    [Fact]
    public async Task Each_collection_works_on_its_own_copy_of_the_template()
    {
        // A second collection's fixture, started here so both certainly exist at once
        var other = new AppFixture();
        await other.InitializeAsync();
        try
        {
            App.DatabaseName.ShouldStartWith($"drags_it_{TestRun.Id}_");
            other.DatabaseName.ShouldStartWith($"drags_it_{TestRun.Id}_");
            other.DatabaseName.ShouldNotBe(App.DatabaseName);
            (await ConnectedDatabaseAsync(App)).ShouldBe(App.DatabaseName);
            (await ConnectedDatabaseAsync(other)).ShouldBe(other.DatabaseName);

            var mine = await Data.Clinic();
            var theirs = await other.Data.Clinic();

            (await ClinicExistsAsync(App, mine.Name)).ShouldBeTrue();
            (await ClinicExistsAsync(other, mine.Name)).ShouldBeFalse();
            (await ClinicExistsAsync(other, theirs.Name)).ShouldBeTrue();
            (await ClinicExistsAsync(App, theirs.Name)).ShouldBeFalse();
        }
        finally
        {
            await other.DisposeAsync();
        }
        TestRun.Databases.ShouldNotContain(other.DatabaseName);
    }

    private static Task<string> ConnectedDatabaseAsync(AppFixture fixture) =>
        fixture.QueryDbAsync(db => db.Database.SqlQueryRaw<string>("SELECT current_database() AS \"Value\"").SingleAsync());

    private static Task<bool> ClinicExistsAsync(AppFixture fixture, string name) =>
        fixture.QueryDbAsync(db => db.Clinics.AnyAsync(c => c.Name == name));
}
