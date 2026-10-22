using System.Net;
using ClinicHub.Application.Common.Paging;
using ClinicHub.Application.Features.Catalog.Protocols;
using ClinicHub.Application.Features.Catalog.Drugs;
using ClinicHub.IntegrationTests.Access;
using ClinicHub.IntegrationTests.Harness.Assertions;
using ClinicHub.IntegrationTests.Harness.Builders;
using ClinicHub.IntegrationTests.Harness.Clients;
using ClinicHub.IntegrationTests.Harness.Hosting;
using Microsoft.EntityFrameworkCore;
using Shouldly;

namespace ClinicHub.IntegrationTests.Isolation;

/// <summary>
/// The catalog routes across clinics (clinic-scoping tech § API): A's owner only ever sees and changes A's rows; B's
/// rows answer exactly like missing ones.
/// </summary>
[Collection(IsolationCollection.Name)]
[Trait("Area", "isolation")]
public class CatalogAcrossClinicsTests(AppFixture app) : IntegrationTest(app)
{
    /// <summary>Clinics A and B, each with two drugs and a group using its first drug; the caller is A's owner.</summary>
    private sealed record Setup(ClinicHandle A, ClinicHandle B, ApiClient Caller, DrugDto ADrug, ProtocolDto AProtocol, DrugDto BDrug,
        ProtocolDto BProtocol);

    private async Task<Setup> TwoClinicsAsync()
    {
        var a = await Data.Clinic().Named(Unique.Name("Clinic A", "عيادة أ"));
        var b = await Data.Clinic().Named(Unique.Name("Clinic B", "عيادة ب"));
        var aDrug = await Data.Drug(a).Named(Unique.Name("Tobradex", "توبرادكس"));
        await Data.Drug(a);
        var aProtocol = await Data.Protocol(a).With(aDrug);
        var bDrug = await Data.Drug(b).Named(Unique.Name("Vigamox", "فيجاموكس"));
        await Data.Drug(b);
        var bProtocol = await Data.Protocol(b).With(bDrug);
        return new Setup(a, b, await Login.OwnerAsync(a), aDrug, aProtocol, bDrug, bProtocol);
    }

    [Fact]
    [Trait("Tier", "Smoke")]
    [Trait("Case", "ISO-001")]
    public async Task The_drug_list_has_only_the_clinics_drugs_and_counts_only_them()
    {
        var s = await TwoClinicsAsync();
        var aDrugIds = await DrugIdsAsync(s.A.Id);

        var page = await (await s.Caller.GetAsync("/api/v1/drugs?pageSize=100")).ReadAsync<PagedResult<DrugDto>>();

        page.Items.Select(d => d.Id).ShouldBe(aDrugIds, ignoreOrder: true);
        page.TotalCount.ShouldBe(aDrugIds.Count);
        page.Items.ShouldNotContain(d => d.Id == s.BDrug.Id);
    }

    [Fact]
    [Trait("Case", "ISO-002")]
    public async Task Searching_for_a_name_that_only_another_clinic_has_finds_nothing()
    {
        var s = await TwoClinicsAsync();

        var page = await (await s.Caller.GetAsync($"/api/v1/drugs?search={Uri.EscapeDataString(s.BDrug.Name)}"))
            .ReadAsync<PagedResult<DrugDto>>();

        page.Items.ShouldBeEmpty();
        page.TotalCount.ShouldBe(0);
    }

    [Fact]
    [Trait("Case", "ISO-003")]
    public async Task Another_clinics_drug_is_not_found()
    {
        var s = await TwoClinicsAsync();

        await (await s.Caller.GetAsync($"/api/v1/drugs/{s.BDrug.Id}")).ShouldBeProblemAsync(HttpStatusCode.NotFound, "notFound");
    }

    [Fact]
    [Trait("Tier", "Smoke")]
    [Trait("Case", "ISO-004")]
    public async Task Updating_another_clinics_drug_is_not_found_and_changes_nothing()
    {
        var s = await TwoClinicsAsync();

        var response = await s.Caller.PutAsync($"/api/v1/drugs/{s.BDrug.Id}", new { name = "Hijacked " + Guid.NewGuid() });

        await response.ShouldBeProblemAsync(HttpStatusCode.NotFound, "notFound");
        (await DrugNameAsync(s.BDrug.Id)).ShouldBe(s.BDrug.Name);
    }

    [Fact]
    [Trait("Case", "ISO-005")]
    public async Task Deleting_another_clinics_drug_is_not_found_and_keeps_it_and_its_group_lines()
    {
        var s = await TwoClinicsAsync();

        var response = await s.Caller.DeleteAsync($"/api/v1/drugs/{s.BDrug.Id}");

        await response.ShouldBeProblemAsync(HttpStatusCode.NotFound, "notFound");
        (await DrugNameAsync(s.BDrug.Id)).ShouldBe(s.BDrug.Name);
        (await LineDrugIdsAsync(s.BProtocol.Id)).ShouldBe([s.BDrug.Id]);
    }

    [Fact]
    [Trait("Case", "ISO-006")]
    public async Task The_groups_of_another_clinics_drug_are_an_empty_list()
    {
        var s = await TwoClinicsAsync();

        var response = await s.Caller.GetAsync($"/api/v1/drugs/{s.BDrug.Id}/groups");

        await response.ShouldBeOkAsync();
        (await response.ReadAsync<List<string>>()).ShouldBeEmpty();
    }

    [Fact]
    [Trait("Case", "ISO-007")]
    public async Task The_group_list_has_only_the_clinics_groups_naming_only_its_drugs()
    {
        var s = await TwoClinicsAsync();
        var aDrugIds = await DrugIdsAsync(s.A.Id);
        var aProtocolIds = await App.QueryDbAsync(db =>
            db.Protocols.IgnoreQueryFilters().Where(g => g.ClinicId == s.A.Id).Select(g => g.Id).ToListAsync());

        var page = await (await s.Caller.GetAsync("/api/v1/drug-groups?pageSize=100")).ReadAsync<PagedResult<ProtocolDto>>();

        page.Items.Select(g => g.Id).ShouldBe(aProtocolIds, ignoreOrder: true);
        page.TotalCount.ShouldBe(aProtocolIds.Count);
        page.Items.SelectMany(g => g.Items).ShouldAllBe(i => aDrugIds.Contains(i.Drug.Id));
    }

    [Fact]
    [Trait("Case", "ISO-008")]
    public async Task Another_clinics_group_is_not_found()
    {
        var s = await TwoClinicsAsync();

        await (await s.Caller.GetAsync($"/api/v1/drug-groups/{s.BProtocol.Id}")).ShouldBeProblemAsync(HttpStatusCode.NotFound, "notFound");
    }

    [Fact]
    [Trait("Case", "ISO-009")]
    public async Task Updating_another_clinics_group_with_own_drugs_is_not_found_and_changes_nothing()
    {
        var s = await TwoClinicsAsync();

        var response = await s.Caller.PutAsync($"/api/v1/drug-groups/{s.BProtocol.Id}", CatalogRoutes.ProtocolBody(s.ADrug.Id));

        await response.ShouldBeProblemAsync(HttpStatusCode.NotFound, "notFound");
        (await ProtocolNameAsync(s.BProtocol.Id)).ShouldBe(s.BProtocol.Name);
        (await LineDrugIdsAsync(s.BProtocol.Id)).ShouldBe([s.BDrug.Id]);
    }

    [Fact]
    [Trait("Case", "ISO-010")]
    public async Task Updating_another_clinics_group_with_its_drugs_answers_drug_not_found_first()
    {
        var s = await TwoClinicsAsync();

        var response = await s.Caller.PutAsync($"/api/v1/drug-groups/{s.BProtocol.Id}", CatalogRoutes.ProtocolBody(s.BDrug.Id));

        await response.ShouldBeProblemAsync(HttpStatusCode.BadRequest, "drugNotFound");
        (await ProtocolNameAsync(s.BProtocol.Id)).ShouldBe(s.BProtocol.Name);
        (await LineDrugIdsAsync(s.BProtocol.Id)).ShouldBe([s.BDrug.Id]);
    }

    [Fact]
    [Trait("Case", "ISO-011")]
    public async Task Deleting_another_clinics_group_is_not_found_and_keeps_it()
    {
        var s = await TwoClinicsAsync();

        var response = await s.Caller.DeleteAsync($"/api/v1/drug-groups/{s.BProtocol.Id}");

        await response.ShouldBeProblemAsync(HttpStatusCode.NotFound, "notFound");
        (await ProtocolNameAsync(s.BProtocol.Id)).ShouldBe(s.BProtocol.Name);
        (await LineDrugIdsAsync(s.BProtocol.Id)).ShouldBe([s.BDrug.Id]);
    }

    [Fact]
    [Trait("Case", "ISO-012")]
    public async Task A_new_group_with_another_clinics_drug_is_refused_and_not_created()
    {
        var s = await TwoClinicsAsync();
        var groupsBefore = await ProtocolCountAsync(s.A.Id);

        var response = await s.Caller.PostAsync("/api/v1/drug-groups", CatalogRoutes.ProtocolBody(s.ADrug.Id, s.BDrug.Id));

        await response.ShouldBeProblemAsync(HttpStatusCode.BadRequest, "drugNotFound");
        (await ProtocolCountAsync(s.A.Id)).ShouldBe(groupsBefore);
    }

    [Fact]
    [Trait("Case", "ISO-013")]
    public async Task Adding_another_clinics_drug_to_an_own_group_is_refused_and_changes_nothing()
    {
        var s = await TwoClinicsAsync();

        var response = await s.Caller.PutAsync($"/api/v1/drug-groups/{s.AProtocol.Id}", CatalogRoutes.ProtocolBody(s.ADrug.Id, s.BDrug.Id));

        await response.ShouldBeProblemAsync(HttpStatusCode.BadRequest, "drugNotFound");
        (await ProtocolNameAsync(s.AProtocol.Id)).ShouldBe(s.AProtocol.Name);
        (await LineDrugIdsAsync(s.AProtocol.Id)).ShouldBe([s.ADrug.Id]);
    }

    [Fact]
    [Trait("Case", "ISO-014")]
    public async Task Another_clinics_drug_answers_exactly_like_a_drug_that_never_existed()
    {
        var s = await TwoClinicsAsync();
        const int neverExisted = 2_147_483_000;

        var other = await (await s.Caller.GetAsync($"/api/v1/drugs/{s.BDrug.Id}")).ShouldBeProblemAsync(HttpStatusCode.NotFound, "notFound");
        var missing = await (await s.Caller.GetAsync($"/api/v1/drugs/{neverExisted}")).ShouldBeProblemAsync(HttpStatusCode.NotFound, "notFound");

        other.Instance.ShouldBe($"/api/v1/drugs/{s.BDrug.Id}");
        missing.Instance.ShouldBe($"/api/v1/drugs/{neverExisted}");
        // Everything but the request's own path and trace id is the same
        Comparable(other).ShouldBe(Comparable(missing));
        other.Body.Select(p => p.Key).ShouldBe(missing.Body.Select(p => p.Key));

        var otherProtocol = await (await s.Caller.GetAsync($"/api/v1/drug-groups/{s.BProtocol.Id}")).ShouldBeProblemAsync(HttpStatusCode.NotFound, "notFound");
        var missingProtocol = await (await s.Caller.GetAsync($"/api/v1/drug-groups/{neverExisted}")).ShouldBeProblemAsync(HttpStatusCode.NotFound, "notFound");
        Comparable(otherProtocol).ShouldBe(Comparable(missingProtocol));
    }

    [Fact]
    [Trait("Tier", "Smoke")]
    [Trait("Case", "ISO-015")]
    public async Task A_new_drug_is_stored_in_the_callers_clinic_and_the_other_clinic_cannot_see_it()
    {
        var s = await TwoClinicsAsync();
        var bOwner = await Login.OwnerAsync(s.B);

        var created = await (await s.Caller.PostAsync("/api/v1/drugs", new { name = Unique.Name("Pred Forte", "بريد فورت") }))
            .ReadAsync<DrugDto>();

        (await App.QueryDbAsync(db => db.Drugs.IgnoreQueryFilters().Where(d => d.Id == created.Id).Select(d => d.ClinicId).SingleAsync()))
            .ShouldBe(s.A.Id);
        await (await bOwner.GetAsync($"/api/v1/drugs/{created.Id}")).ShouldBeProblemAsync(HttpStatusCode.NotFound, "notFound");
        var bSearch = await (await bOwner.GetAsync($"/api/v1/drugs?search={Uri.EscapeDataString(created.Name)}")).ReadAsync<PagedResult<DrugDto>>();
        bSearch.Items.ShouldBeEmpty();
    }

    [Fact]
    [Trait("Case", "ISO-016")]
    public async Task A_new_group_and_each_of_its_lines_are_stored_in_the_callers_clinic()
    {
        var s = await TwoClinicsAsync();
        var second = await Data.Drug(s.A);

        var created = await (await s.Caller.PostAsync("/api/v1/drug-groups", CatalogRoutes.ProtocolBody(s.ADrug.Id, second.Id)))
            .ReadAsync<ProtocolDto>();

        (await App.QueryDbAsync(db => db.Protocols.IgnoreQueryFilters().Where(g => g.Id == created.Id).Select(g => g.ClinicId).SingleAsync()))
            .ShouldBe(s.A.Id);
        var lineClinics = await App.QueryDbAsync(db => db.ProtocolItems.IgnoreQueryFilters()
            .Where(i => i.ProtocolId == created.Id).Select(i => i.ClinicId).ToListAsync());
        lineClinics.Count.ShouldBe(2);
        lineClinics.ShouldAllBe(id => id == s.A.Id);
    }

    [Fact]
    [Trait("Case", "ISO-017")]
    public async Task The_templates_rows_are_not_found_and_not_listed_the_clinic_has_its_own_copies()
    {
        var templateId = await App.TemplateClinicIdAsync();
        var templateDrug = await Data.Drug(templateId).Named(Unique.Name("Template drug", "دواء القالب"));
        var templateProtocol = await Data.Protocol(templateId).Named(Unique.Name("Post cataract", "بعد المياه البيضاء")).With(templateDrug);
        var a = await Data.Clinic();
        var owner = await Login.OwnerAsync(a);

        await (await owner.GetAsync($"/api/v1/drugs/{templateDrug.Id}")).ShouldBeProblemAsync(HttpStatusCode.NotFound, "notFound");
        await (await owner.PutAsync($"/api/v1/drugs/{templateDrug.Id}", new { name = "Hijacked " + Guid.NewGuid() }))
            .ShouldBeProblemAsync(HttpStatusCode.NotFound, "notFound");
        await (await owner.DeleteAsync($"/api/v1/drugs/{templateDrug.Id}")).ShouldBeProblemAsync(HttpStatusCode.NotFound, "notFound");
        await (await owner.GetAsync($"/api/v1/drug-groups/{templateProtocol.Id}")).ShouldBeProblemAsync(HttpStatusCode.NotFound, "notFound");
        await (await owner.PutAsync($"/api/v1/drug-groups/{templateProtocol.Id}", CatalogRoutes.ProtocolBody((await Data.Drug(a)).Id)))
            .ShouldBeProblemAsync(HttpStatusCode.NotFound, "notFound");
        await (await owner.DeleteAsync($"/api/v1/drug-groups/{templateProtocol.Id}")).ShouldBeProblemAsync(HttpStatusCode.NotFound, "notFound");

        var drugs = await (await owner.GetAsync("/api/v1/drugs?pageSize=100")).ReadAsync<PagedResult<DrugDto>>();
        var groups = await (await owner.GetAsync("/api/v1/drug-groups?pageSize=100")).ReadAsync<PagedResult<ProtocolDto>>();
        drugs.Items.ShouldNotContain(d => d.Id == templateDrug.Id);
        groups.Items.ShouldNotContain(g => g.Id == templateProtocol.Id);
        drugs.Items.ShouldContain(d => d.Name == templateDrug.Name);
        groups.Items.ShouldContain(g => g.Name == templateProtocol.Name);
        (await DrugNameAsync(templateDrug.Id)).ShouldBe(templateDrug.Name);
        (await ProtocolNameAsync(templateProtocol.Id)).ShouldBe(templateProtocol.Name);
    }

    [Fact]
    [Trait("Case", "ISO-018")]
    public async Task A_drugs_groups_name_only_the_clinics_groups()
    {
        var s = await TwoClinicsAsync();
        var second = await Data.Protocol(s.A).With(s.ADrug);

        var names = await (await s.Caller.GetAsync($"/api/v1/drugs/{s.ADrug.Id}/groups")).ReadAsync<List<string>>();

        names.ShouldBe([s.AProtocol.Name, second.Name], ignoreOrder: true);
        names.ShouldNotContain(s.BProtocol.Name);
    }

    private static string Comparable(Problem problem) =>
        $"{problem.Type}|{problem.Title}|{problem.Status}|{problem.Detail}|{problem.Code}|" +
        string.Join(";", problem.Errors.Select(e => $"{e.Code}:{e.Description}:{e.Field}")) +
        $"|{problem.ClinicNames is null}";

    private Task<List<int>> DrugIdsAsync(int clinicId) =>
        App.QueryDbAsync(db => db.Drugs.IgnoreQueryFilters().Where(d => d.ClinicId == clinicId).Select(d => d.Id).ToListAsync());

    private Task<string> DrugNameAsync(int drugId) =>
        App.QueryDbAsync(db => db.Drugs.IgnoreQueryFilters().Where(d => d.Id == drugId).Select(d => d.Name).SingleOrDefaultAsync());

    private Task<string> ProtocolNameAsync(int groupId) =>
        App.QueryDbAsync(db => db.Protocols.IgnoreQueryFilters().Where(g => g.Id == groupId).Select(g => g.Name).SingleOrDefaultAsync());

    private Task<int> ProtocolCountAsync(int clinicId) =>
        App.QueryDbAsync(db => db.Protocols.IgnoreQueryFilters().CountAsync(g => g.ClinicId == clinicId));

    private Task<List<int>> LineDrugIdsAsync(int groupId) =>
        App.QueryDbAsync(db => db.ProtocolItems.IgnoreQueryFilters().Where(i => i.ProtocolId == groupId)
            .OrderBy(i => i.Order).Select(i => i.DrugId).ToListAsync());
}
