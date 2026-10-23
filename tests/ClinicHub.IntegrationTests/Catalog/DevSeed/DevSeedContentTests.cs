using ClinicHub.Application.Common.Abstractions;
using ClinicHub.Application.Features.Access.Roles;
using ClinicHub.Application.Features.Catalog.Categories;
using ClinicHub.Domain.Catalog;
using ClinicHub.Infrastructure.Platform;
using ClinicHub.IntegrationTests.Admin;
using ClinicHub.IntegrationTests.Harness.Builders;
using ClinicHub.IntegrationTests.Harness.Hosting;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Shouldly;

namespace ClinicHub.IntegrationTests.Catalog.DevSeed;

/// <summary>
/// What the dev seed stores on a fresh Development database with the shared catalog loaded (platform-admin tech
/// § Dev seed; drugs tech § Edge cases; access tech § Dev seed): the template sample (two own drugs in «العيون», the
/// protocol "After cataract surgery" on VIGAMOX and Prednisolone), both demo clinics owned by "Dev Owner", "Dev
/// Assistant" as Assistant in "Demo clinic" and as the custom "Viewer" in "Second demo clinic"; the dev phones' rules
/// (the same phone in both settings stays the owner only; an invalid one is a startup error naming its setting); a
/// restart seeds nothing again. Each test runs the seeder of a Development variant on its reset database (no clinic
/// but the template), so the next test starts on a reset one.
/// </summary>
[Collection(CatalogCollection.Name)]
[Trait("Area", "catalog")]
public class DevSeedContentTests(AppFixture app) : IntegrationTest(app)
{
    [Fact]
    [Trait("Case", "CAT-238")]
    public async Task A_fresh_dev_database_gets_the_documented_template_sample_demo_clinics_and_staff_and_a_restart_adds_nothing()
    {
        await using var dev = DevApp(Unique.Phone(), Unique.Phone());

        await SeedAsync(dev);

        var templateId = await App.TemplateClinicIdAsync();
        var drugs = await App.QueryDbAsync(db => db.Drugs.IgnoreQueryFilters().Where(d => d.ClinicId == templateId).OrderBy(d => d.Id).ToListAsync());
        drugs.Select(d => d.Name).ShouldBe(["Prednisolone acetate 1%", "Timolol 0.5%"]);
        var subCategories = await App.QueryDbAsync(db => db.SubCategories.Where(s => s.CategoryId == CategoryIds.Eye).ToListAsync());
        var antiInflammatories = subCategories.Single(s => s.NameEn == "Eye anti-inflammatories").Id;

        var prednisolone = drugs[0];
        (prednisolone.CategoryId, prednisolone.SubCategoryId).ShouldBe((CategoryIds.Eye, antiInflammatories));
        prednisolone.Description.ShouldBe("steroid eye drops", StringCompareShould.IgnoreCase);
        Dose(prednisolone.DefaultDosing).ShouldBe((1m, "drop", "daily", 4, 4, "weeks"), "1 drop 4 times a day for 4 weeks");
        var timolol = drugs[1];
        (timolol.CategoryId, timolol.SubCategoryId).ShouldBe((CategoryIds.Eye, SubCategoryIds.Glaucoma));
        Dose(timolol.DefaultDosing).ShouldBe((1m, "drop", "daily", 2, null, null), "1 drop twice a day");

        var protocol = await App.QueryDbAsync(db => db.Protocols.IgnoreQueryFilters().Include(g => g.Items)
            .SingleAsync(g => g.ClinicId == templateId));
        protocol.Name.ShouldBe("After cataract surgery");
        var lines = protocol.Items.OrderBy(i => i.Order).ToList();
        var vigamoxId = await App.QueryDbAsync(db => db.Drugs.IgnoreQueryFilters()
            .Where(d => d.ClinicId == null && d.Name == StartupSeeder.SampleSharedDrugName).Select(d => d.Id).SingleAsync());
        lines.Select(i => i.DrugId).ShouldBe([vigamoxId, prednisolone.Id]);
        Dose(lines[0].Dosing).ShouldBe((1m, "drop", "daily", 4, 1, "weeks"), "VIGAMOX: 1 drop 4 times a day for 1 week");
        var taper = lines[1].Dosing;
        taper.ShouldNotBeNull();
        taper.Eye.ShouldBe(DosingCodes.AskEye);
        taper.DoseAmount.ShouldBeNull("the dose comes from the drug");
        taper.TaperSteps.Select(s => $"{s.DoseAmount}|{s.Frequency}|{s.FrequencyValue}|{s.DurationValue}|{s.DurationUnit}")
            .ShouldBe(["|daily|4|1|weeks", "|daily|3|1|weeks", "|daily|2|1|weeks", "|daily|1|1|weeks"], "a taper 4 → 1 times a day, one week each");

        var staff = await StaffAsync();
        staff.Select(s => s.Clinic).Distinct().ShouldBe([StartupSeeder.DemoClinicName, StartupSeeder.SecondDemoClinicName], ignoreOrder: true);
        staff.ShouldContain(new StaffRow(StartupSeeder.DemoClinicName, StartupSeeder.DevOwnerName, DefaultRoles.Owner));
        staff.ShouldContain(new StaffRow(StartupSeeder.SecondDemoClinicName, StartupSeeder.DevOwnerName, DefaultRoles.Owner));
        staff.ShouldContain(new StaffRow(StartupSeeder.DemoClinicName, StartupSeeder.DevAssistantName, DefaultRoles.Assistant));
        staff.ShouldContain(new StaffRow(StartupSeeder.SecondDemoClinicName, StartupSeeder.DevAssistantName, StartupSeeder.DevViewerRoleName));
        staff.Count(s => s.FullName == StartupSeeder.DevAssistantName).ShouldBe(2, "one role in each demo clinic");

        // A restart seeds nothing again
        var before = await App.RowCountsAsync();
        await SeedAsync(dev);
        (await App.RowCountsAsync()).ShouldBe(before);
    }

    [Fact]
    [Trait("Case", "CAT-238")]
    public async Task The_same_phone_in_both_dev_settings_stays_the_owner_only()
    {
        var phone = Unique.Phone();
        await using var dev = DevApp(phone, phone);

        await SeedAsync(dev);

        var staff = await StaffAsync();
        staff.ShouldBe([
            new StaffRow(StartupSeeder.DemoClinicName, StartupSeeder.DevOwnerName, DefaultRoles.Owner),
            new StaffRow(StartupSeeder.SecondDemoClinicName, StartupSeeder.DevOwnerName, DefaultRoles.Owner),
        ], ignoreOrder: true);
        (await App.QueryDbAsync(db => db.Roles.IgnoreQueryFilters().CountAsync(r => r.Name == StartupSeeder.DevViewerRoleName)))
            .ShouldBe(1, "the Viewer role is still created");
    }

    [Theory]
    [Trait("Case", "CAT-238")]
    [InlineData("Platform:DevOwnerPhone")]
    [InlineData("Platform:DevAssistantPhone")]
    public async Task An_invalid_dev_phone_is_a_startup_error_naming_its_setting_and_seeds_no_clinic(string setting)
    {
        await using var dev = DevApp(
            setting == "Platform:DevOwnerPhone" ? "not a phone" : Unique.Phone(),
            setting == "Platform:DevAssistantPhone" ? "not a phone" : Unique.Phone());

        var error = await Should.ThrowAsync<InvalidOperationException>(() => SeedAsync(dev));

        error.Message.ShouldContain(setting);
        (await App.QueryDbAsync(db => db.Clinics.CountAsync(c => !c.IsTemplate))).ShouldBe(0);
    }

    /// <summary>The app as in Development (its dev phones set); its own startup doesn't run the dev seed.</summary>
    private ClinicHubFactory DevApp(string ownerPhone, string assistantPhone)
    {
        var dev = App.CreateVariant(new Dictionary<string, string>
        {
            ["Platform:DevOwnerPhone"] = ownerPhone,
            ["Platform:DevAssistantPhone"] = assistantPhone,
        });
        dev.Start();
        return dev;
    }

    private static async Task SeedAsync(ClinicHubFactory dev)
    {
        await using var scope = dev.Services.CreateAsyncScope();
        await scope.ServiceProvider.GetRequiredService<IStartupSeeder>().SeedAsync(isDevelopment: true);
    }

    private static (decimal? Amount, string Unit, string Frequency, int? Times, int? Duration, string DurationUnit) Dose(Dosing dosing)
    {
        dosing.ShouldNotBeNull();
        return (dosing.DoseAmount, dosing.DoseUnit, dosing.Frequency, dosing.FrequencyValue, dosing.DurationValue, dosing.DurationUnit);
    }

    /// <summary>Every staff role of every clinic: (clinic name, staff name, role name).</summary>
    private async Task<List<StaffRow>> StaffAsync()
    {
        var rows = await App.QueryDbAsync(db => db.Staff.IgnoreQueryFilters()
            .SelectMany(s => s.Roles.Select(r => new { s.ClinicId, s.FullName, Role = r.Role.Name }))
            .ToListAsync());
        var clinics = await App.QueryDbAsync(db => db.Clinics.ToDictionaryAsync(c => c.Id, c => c.Name));
        return rows.Select(r => new StaffRow(clinics[r.ClinicId], r.FullName, r.Role)).ToList();
    }

    private sealed record StaffRow(string Clinic, string FullName, string Role);
}
