using System.Net;
using ClinicHub.IntegrationTests.Harness.Assertions;
using ClinicHub.IntegrationTests.Harness.Hosting;
using Microsoft.EntityFrameworkCore;
using Shouldly;

namespace ClinicHub.IntegrationTests.SelfTests;

/// <summary>What every test class finds when it starts: a fresh template (template clinic + test super admin).</summary>
internal static class FreshDatabase
{
    public static async Task ShouldHoldOnlyTheSeedAsync(AppFixture app)
    {
        var clinics = await app.QueryDbAsync(db => db.Clinics.Select(c => c.IsTemplate).ToListAsync());
        clinics.ShouldBe([true]);
        var users = await app.QueryDbAsync(db => db.Users.Select(u => new { u.Phone, u.IsSuperAdmin }).ToListAsync());
        users.ShouldHaveSingleItem().ShouldBe(new { Phone = app.SuperAdminPhone, IsSuperAdmin = true });
        (await app.QueryDbAsync(db => db.OtpCodes.CountAsync())).ShouldBe(0);
        (await app.QueryDbAsync(db => db.Sessions.CountAsync())).ShouldBe(0);
        (await app.QueryDbAsync(db => db.Drugs.IgnoreQueryFilters().CountAsync())).ShouldBe(0);
        (await app.QueryDbAsync(db => db.Database.GetPendingMigrationsAsync())).ShouldBeEmpty();
    }

    /// <summary>Leaves data of every kind behind, for the next class to (not) find.</summary>
    public static async Task DirtyAsync(AppFixture app)
    {
        var clinic = await app.Data.Clinic();
        await app.Data.Drug(clinic);
        await app.Login.OwnerAsync(clinic);
    }
}

// Two classes in one collection, in either order: the second one proves the reset between classes

[Collection(InfraCollectionB.Name)]
[Trait("Area", "infra")]
public class ResetProbeOneTests(AppFixture app) : IntegrationTest(app)
{
    [Fact]
    public async Task A_class_starts_on_a_fresh_template()
    {
        await FreshDatabase.ShouldHoldOnlyTheSeedAsync(App);
        await FreshDatabase.DirtyAsync(App);
    }
}

[Collection(InfraCollectionB.Name)]
[Trait("Area", "infra")]
public class ResetProbeTwoTests(AppFixture app) : IntegrationTest(app)
{
    [Fact]
    public async Task A_class_starts_on_a_fresh_template()
    {
        await FreshDatabase.ShouldHoldOnlyTheSeedAsync(App);
        await FreshDatabase.DirtyAsync(App);
    }
}

[Collection(InfraCollectionB.Name)]
[Trait("Area", "infra")]
public class ResetTests(AppFixture app) : IntegrationTest(app)
{
    [Fact]
    public async Task A_reset_empties_the_database_reseeds_it_and_forgets_cached_access()
    {
        var clinic = await Data.Clinic();
        var drug = await Data.Drug(clinic);
        var owner = await Login.OwnerAsync(clinic);
        await (await owner.GetAsync($"/api/v1/drugs/{drug.Id}")).ShouldBeOkAsync();

        await App.ResetAsync();

        await FreshDatabase.ShouldHoldOnlyTheSeedAsync(App);
        // The owner's access was cached as "active"; the staff row is gone, so a kept cache entry would answer 200
        await (await owner.GetAsync($"/api/v1/drugs/{drug.Id}")).ShouldBeProblemAsync(HttpStatusCode.Forbidden, "noAccess");
        // The reseeded super admin logs in
        var admin = await Login.SuperAdminAsync();
        (await admin.MeAsync()).User.IsSuperAdmin.ShouldBeTrue();
    }

    [Fact]
    public void The_clock_starts_at_the_real_time_in_every_test()
    {
        Clock.Offset.ShouldBe(TimeSpan.Zero);
        (Clock.GetUtcNow() - DateTimeOffset.UtcNow).Duration().ShouldBeLessThan(TimeSpan.FromSeconds(5));
        Clock.Advance(TimeSpan.FromHours(2));
    }

    [Fact]
    public void The_clock_is_reset_after_a_test_that_moved_it()
    {
        Clock.Offset.ShouldBe(TimeSpan.Zero);
        Clock.Advance(TimeSpan.FromDays(31));
    }
}
