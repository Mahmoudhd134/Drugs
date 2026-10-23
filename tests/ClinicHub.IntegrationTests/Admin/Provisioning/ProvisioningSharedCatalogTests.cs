using ClinicHub.Application.Features.Catalog.Protocols;
using ClinicHub.IntegrationTests.Admin.SharedDrugs;
using ClinicHub.IntegrationTests.Harness.Assertions;
using ClinicHub.IntegrationTests.Harness.Builders;
using ClinicHub.IntegrationTests.Harness.Clients;
using ClinicHub.IntegrationTests.Harness.Hosting;
using Microsoft.EntityFrameworkCore;
using Shouldly;
using static ClinicHub.IntegrationTests.Admin.SharedDrugs.SharedCatalogRoutes;

namespace ClinicHub.IntegrationTests.Admin.Provisioning;

/// <summary>A new clinic's protocols as provisioning copies them (the clinic's owner reads them).</summary>
internal static class ProvisionedCatalog
{
    /// <summary>Creates a clinic through the admin API and logs its owner in.</summary>
    public static async Task<(int ClinicId, ApiClient Owner)> CreateClinicAsync(AppFixture app)
    {
        var admin = await app.Login.SharedSuperAdminAsync();
        var phone = Unique.Phone();
        var clinic = await admin.CreateClinicAsync(phone);
        return (clinic.Id, await app.Login.AsAsync(phone));
    }

    /// <summary>The clinic's copy of the template protocol named <paramref name="name"/>.</summary>
    public static async Task<ProtocolDto> CopyOfAsync(ApiClient owner, string name) =>
        (await owner.ProtocolsAsync()).Where(p => p.Name == name).ShouldHaveSingleItem($"the copy of '{name}'");
}

/// <summary>
/// Provisioning with the shared catalog (design M1.7 D1, D6, § 9 M1.7b; M1.5 D5): only the template's own drugs are
/// copied; a protocol line on a shared drug keeps the same shared id, withdrawn or not. The template accumulates the
/// class's data, so each test reads its own protocol by name.
/// </summary>
[Collection(AdminCollection3.Name)]
[Trait("Area", "admin")]
public class ProvisioningSharedCatalogTests(AppFixture app) : IntegrationTest(app)
{
    [Fact]
    [Trait("Case", "CAT-219")]
    [Trait("Case", "ADM-072")]
    public async Task A_copied_line_keeps_the_same_shared_drug_id_and_an_own_line_points_to_the_clinics_copy()
    {
        var templateId = await App.TemplateClinicIdAsync();
        var shared = await Data.SharedDrug();
        var own = await Data.Drug(templateId).Named(Unique.Name("Template own", "خاص بالنموذج")).WithDosing(Dosings.Drops());
        var protocol = await Data.Protocol(templateId).Named(Unique.Name("Mixed", "مختلط"))
            .With(shared.Id, Dosings.Drops(timesADay: 2, eye: "left")).With(own);

        var (clinicId, owner) = await ProvisionedCatalog.CreateClinicAsync(App);

        var copy = await ProvisionedCatalog.CopyOfAsync(owner, protocol.Name);
        copy.Id.ShouldNotBe(protocol.Id);
        copy.Items.Select(i => i.Drug.IsShared).ShouldBe([true, false]);
        copy.Items[0].Drug.Id.ShouldBe(shared.Id);
        copy.Items[0].Dosing.Eye.ShouldBe("left");
        copy.Items[0].Dosing.FrequencyValue.ShouldBe(2);
        var ownCopy = (await owner.OwnDrugsAsync()).Items.Where(d => d.Name == own.Name).ShouldHaveSingleItem();
        ownCopy.Id.ShouldNotBe(own.Id);
        copy.Items[1].Drug.Id.ShouldBe(ownCopy.Id);
        (await App.QueryDbAsync(db => db.Drugs.IgnoreQueryFilters().Where(d => d.Id == ownCopy.Id).Select(d => d.ClinicId).SingleAsync()))
            .ShouldBe(clinicId);
        var templateLines = await App.QueryDbAsync(db => db.ProtocolItems.IgnoreQueryFilters()
            .Where(i => i.ProtocolId == protocol.Id).OrderBy(i => i.Order).Select(i => i.DrugId).ToListAsync());
        templateLines.ShouldBe([shared.Id, own.Id], "the template's lines are unchanged");
    }

    [Fact]
    [Trait("Case", "CAT-221")]
    public async Task No_shared_drug_is_copied_and_the_clinic_owns_as_many_drugs_as_the_template()
    {
        var templateId = await App.TemplateClinicIdAsync();
        var shared = await Data.SharedDrug();
        await Data.Drug(templateId);
        await Data.Protocol(templateId).With(shared.Id);
        var sharedBefore = await App.QueryDbAsync(db => db.Drugs.IgnoreQueryFilters().CountAsync(d => d.ClinicId == null));
        var templateOwn = await App.QueryDbAsync(db => db.Drugs.IgnoreQueryFilters().CountAsync(d => d.ClinicId == templateId));

        var (clinicId, owner) = await ProvisionedCatalog.CreateClinicAsync(App);

        (await App.QueryDbAsync(db => db.Drugs.IgnoreQueryFilters().CountAsync(d => d.ClinicId == null))).ShouldBe(sharedBefore);
        (await App.QueryDbAsync(db => db.Drugs.IgnoreQueryFilters().CountAsync(d => d.ClinicId == clinicId))).ShouldBe(templateOwn);
        (await owner.OwnDrugsAsync()).TotalCount.ShouldBe(templateOwn);
        (await owner.SearchClinicDrugsAsync(shared.Name)).Items.Select(d => (d.Id, d.IsShared)).ShouldBe([(shared.Id, true)]);
    }

    [Fact]
    [Trait("Case", "CAT-222")]
    public async Task A_template_line_on_a_withdrawn_shared_drug_is_copied_with_withdrawn_true()
    {
        var templateId = await App.TemplateClinicIdAsync();
        var shared = await Data.SharedDrug();
        var protocol = await Data.Protocol(templateId).Named(Unique.Name("Disabled inside", "معطل بالداخل"))
            .With(await Data.Drug(templateId)).With(shared.Id, Dosings.AskEye());
        await Data.WithdrawSharedDrugAsync(shared.Id);

        var (_, owner) = await ProvisionedCatalog.CreateClinicAsync(App);

        var copy = await ProvisionedCatalog.CopyOfAsync(owner, protocol.Name);
        copy.Items.Count.ShouldBe(2);
        var line = copy.Items[1];
        (line.Drug.Id, line.Drug.IsShared, line.Drug.Withdrawn).ShouldBe((shared.Id, true, true));
        line.Dosing.Eye.ShouldBe("ask");
        (await (await owner.GetAsync(Protocol(copy.Id))).ReadAsync<ProtocolDto>()).Items[1].Drug.Withdrawn.ShouldBeTrue();
    }
}

/// <summary>A template with no own drug, only a protocol of shared drugs (the class starts on a fresh, empty template).</summary>
[Collection(AdminCollection3.Name)]
[Trait("Area", "admin")]
public class ProvisioningFromSharedOnlyTemplateTests(AppFixture app) : IntegrationTest(app)
{
    [Fact]
    [Trait("Case", "CAT-220")]
    public async Task A_template_without_own_drugs_still_gives_its_protocol_of_shared_drugs()
    {
        var templateId = await App.TemplateClinicIdAsync();
        var first = await Data.SharedDrug();
        var second = await Data.SharedDrug();
        var protocol = await Data.Protocol(templateId).Named(Unique.Name("Shared only", "مشترك فقط"))
            .With(first.Id).With(second.Id, Dosings.Drops(eye: "right"));
        (await App.QueryDbAsync(db => db.Drugs.IgnoreQueryFilters().CountAsync(d => d.ClinicId == templateId))).ShouldBe(0);

        var (clinicId, owner) = await ProvisionedCatalog.CreateClinicAsync(App);

        var copy = (await owner.ProtocolsAsync()).ShouldHaveSingleItem();
        copy.Name.ShouldBe(protocol.Name);
        copy.Id.ShouldNotBe(protocol.Id);
        copy.Items.Select(i => (i.Drug.Id, i.Drug.IsShared)).ShouldBe([(first.Id, true), (second.Id, true)]);
        copy.Items[1].Dosing.Eye.ShouldBe("right");
        (await App.QueryDbAsync(db => db.Drugs.IgnoreQueryFilters().CountAsync(d => d.ClinicId == clinicId))).ShouldBe(0);
        (await App.QueryDbAsync(db => db.Protocols.IgnoreQueryFilters().CountAsync(p => p.ClinicId == clinicId))).ShouldBe(1);
    }
}
