using System.Net;
using ClinicHub.Application.Common.Paging;
using ClinicHub.Application.Features.Catalog.Categories;
using ClinicHub.Application.Features.Catalog.Protocols;
using ClinicHub.Application.Features.Catalog.Drugs;
using ClinicHub.IntegrationTests.Access;
using ClinicHub.IntegrationTests.Harness.Assertions;
using ClinicHub.IntegrationTests.Harness.Builders;
using ClinicHub.IntegrationTests.Harness.Clients;
using ClinicHub.IntegrationTests.Harness.Databases;
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
    /// <summary>Clinics A and B, each with two drugs and a protocol using its first drug; the caller is A's owner.</summary>
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
    public async Task The_drug_list_has_the_clinics_own_drugs_and_the_shared_ones_never_another_clinics()
    {
        var s = await TwoClinicsAsync();
        var aDrugIds = await DrugIdsAsync(s.A.Id);

        var page = await ListAsync(s.Caller, "pageSize=100");
        var own = await ListAsync(s.Caller, "source=own&pageSize=100");

        // A's own drugs + the active shared drugs (design M1.7 D1), never B's own
        page.TotalCount.ShouldBe(aDrugIds.Count + TestRun.Baseline.SharedCount);
        page.Items.Where(d => !d.IsShared).Select(d => d.Id).ShouldBe(aDrugIds, ignoreOrder: true);
        page.Items.ShouldNotContain(d => d.Id == s.BDrug.Id);
        own.Items.Select(d => d.Id).ShouldBe(aDrugIds, ignoreOrder: true);
        own.TotalCount.ShouldBe(aDrugIds.Count);
    }

    [Fact]
    [Trait("Case", "ISO-002")]
    public async Task Searching_for_a_name_that_only_another_clinic_has_finds_nothing()
    {
        var s = await TwoClinicsAsync();
        // B's name is absent from the shared catalog (name, hidden Arabic name, ingredients, category names): only B has it
        var bOwner = await Login.OwnerAsync(s.B);
        (await ListAsync(bOwner, $"search={Uri.EscapeDataString(s.BDrug.Name)}")).Items.Select(d => d.Id).ShouldBe([s.BDrug.Id]);

        var page = await ListAsync(s.Caller, $"search={Uri.EscapeDataString(s.BDrug.Name)}");

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

        var response = await s.Caller.PutAsync($"/api/v1/drugs/{s.BDrug.Id}", DrugBody("Hijacked " + Guid.NewGuid()));

        await response.ShouldBeProblemAsync(HttpStatusCode.NotFound, "notFound");
        (await DrugNameAsync(s.BDrug.Id)).ShouldBe(s.BDrug.Name);
    }

    [Fact]
    [Trait("Case", "ISO-005")]
    public async Task Deleting_another_clinics_drug_is_not_found_and_keeps_it_and_its_protocol_lines()
    {
        var s = await TwoClinicsAsync();

        var response = await s.Caller.DeleteAsync($"/api/v1/drugs/{s.BDrug.Id}");

        await response.ShouldBeProblemAsync(HttpStatusCode.NotFound, "notFound");
        (await DrugNameAsync(s.BDrug.Id)).ShouldBe(s.BDrug.Name);
        (await LineDrugIdsAsync(s.BProtocol.Id)).ShouldBe([s.BDrug.Id]);
    }

    [Fact]
    [Trait("Case", "ISO-006")]
    public async Task The_protocols_of_another_clinics_drug_are_an_empty_list()
    {
        var s = await TwoClinicsAsync();

        var response = await s.Caller.GetAsync($"/api/v1/drugs/{s.BDrug.Id}/protocols");

        await response.ShouldBeOkAsync();
        (await response.ReadAsync<List<string>>()).ShouldBeEmpty();
    }

    [Fact]
    [Trait("Case", "ISO-007")]
    public async Task The_protocol_list_has_only_the_clinics_protocols_naming_only_its_drugs()
    {
        var s = await TwoClinicsAsync();
        var shared = await Data.Shared("VIGAMOX 0.5% EYE DROPS 5 ML");
        await Data.Protocol(s.A).With(shared.Id).With(s.ADrug);
        await Data.Protocol(s.B).With(shared.Id).With(s.BDrug);
        var aDrugIds = await DrugIdsAsync(s.A.Id);
        var bDrugIds = await DrugIdsAsync(s.B.Id);
        var aProtocolIds = await App.QueryDbAsync(db =>
            db.Protocols.IgnoreQueryFilters().Where(g => g.ClinicId == s.A.Id).Select(g => g.Id).ToListAsync());

        var page = await (await s.Caller.GetAsync("/api/v1/protocols?pageSize=100")).ReadAsync<PagedResult<ProtocolDto>>();

        page.Items.Select(g => g.Id).ShouldBe(aProtocolIds, ignoreOrder: true);
        page.TotalCount.ShouldBe(aProtocolIds.Count);
        // A's own drugs or shared drugs, never B's own
        var lines = page.Items.SelectMany(g => g.Items).ToList();
        lines.ShouldAllBe(i => aDrugIds.Contains(i.Drug.Id) || (i.Drug.IsShared && i.Drug.Id == shared.Id));
        lines.ShouldContain(i => i.Drug.Id == shared.Id);
        lines.ShouldNotContain(i => bDrugIds.Contains(i.Drug.Id));
    }

    [Fact]
    [Trait("Case", "ISO-008")]
    public async Task Another_clinics_protocol_is_not_found()
    {
        var s = await TwoClinicsAsync();

        await (await s.Caller.GetAsync($"/api/v1/protocols/{s.BProtocol.Id}")).ShouldBeProblemAsync(HttpStatusCode.NotFound, "notFound");
    }

    [Fact]
    [Trait("Case", "ISO-009")]
    public async Task Updating_another_clinics_protocol_with_own_drugs_is_not_found_and_changes_nothing()
    {
        var s = await TwoClinicsAsync();

        var response = await s.Caller.PutAsync($"/api/v1/protocols/{s.BProtocol.Id}", CatalogRoutes.ProtocolBody(s.ADrug.Id));

        await response.ShouldBeProblemAsync(HttpStatusCode.NotFound, "notFound");
        (await ProtocolNameAsync(s.BProtocol.Id)).ShouldBe(s.BProtocol.Name);
        (await LineDrugIdsAsync(s.BProtocol.Id)).ShouldBe([s.BDrug.Id]);
    }

    [Fact]
    [Trait("Case", "ISO-010")]
    public async Task Updating_another_clinics_protocol_with_its_drugs_answers_drug_not_found_first()
    {
        var s = await TwoClinicsAsync();

        var response = await s.Caller.PutAsync($"/api/v1/protocols/{s.BProtocol.Id}", CatalogRoutes.ProtocolBody(s.BDrug.Id));

        await response.ShouldBeProblemAsync(HttpStatusCode.BadRequest, "drugNotFound");
        (await ProtocolNameAsync(s.BProtocol.Id)).ShouldBe(s.BProtocol.Name);
        (await LineDrugIdsAsync(s.BProtocol.Id)).ShouldBe([s.BDrug.Id]);
    }

    [Fact]
    [Trait("Case", "ISO-011")]
    public async Task Deleting_another_clinics_protocol_is_not_found_and_keeps_it()
    {
        var s = await TwoClinicsAsync();

        var response = await s.Caller.DeleteAsync($"/api/v1/protocols/{s.BProtocol.Id}");

        await response.ShouldBeProblemAsync(HttpStatusCode.NotFound, "notFound");
        (await ProtocolNameAsync(s.BProtocol.Id)).ShouldBe(s.BProtocol.Name);
        (await LineDrugIdsAsync(s.BProtocol.Id)).ShouldBe([s.BDrug.Id]);
    }

    [Fact]
    [Trait("Case", "ISO-012")]
    public async Task A_new_protocol_with_another_clinics_drug_is_refused_and_not_created()
    {
        var s = await TwoClinicsAsync();
        var protocolsBefore = await ProtocolCountAsync(s.A.Id);

        var response = await s.Caller.PostAsync("/api/v1/protocols", CatalogRoutes.ProtocolBody(s.ADrug.Id, s.BDrug.Id));

        await response.ShouldBeProblemAsync(HttpStatusCode.BadRequest, "drugNotFound");
        (await ProtocolCountAsync(s.A.Id)).ShouldBe(protocolsBefore);
    }

    [Fact]
    [Trait("Case", "ISO-013")]
    public async Task Adding_another_clinics_drug_to_an_own_protocol_is_refused_and_changes_nothing()
    {
        var s = await TwoClinicsAsync();

        var response = await s.Caller.PutAsync($"/api/v1/protocols/{s.AProtocol.Id}", CatalogRoutes.ProtocolBody(s.ADrug.Id, s.BDrug.Id));

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

        var otherProtocol = await (await s.Caller.GetAsync($"/api/v1/protocols/{s.BProtocol.Id}")).ShouldBeProblemAsync(HttpStatusCode.NotFound, "notFound");
        var missingProtocol = await (await s.Caller.GetAsync($"/api/v1/protocols/{neverExisted}")).ShouldBeProblemAsync(HttpStatusCode.NotFound, "notFound");
        Comparable(otherProtocol).ShouldBe(Comparable(missingProtocol));
    }

    [Fact]
    [Trait("Tier", "Smoke")]
    [Trait("Case", "ISO-015")]
    public async Task A_new_drug_is_stored_in_the_callers_clinic_and_the_other_clinic_cannot_see_it()
    {
        var s = await TwoClinicsAsync();
        var bOwner = await Login.OwnerAsync(s.B);

        var created = await (await s.Caller.PostAsync("/api/v1/drugs", DrugBody(Unique.Name("Pred Forte", "بريد فورت"))))
            .ReadAsync<DrugDto>();

        (await App.QueryDbAsync(db => db.Drugs.IgnoreQueryFilters().Where(d => d.Id == created.Id).Select(d => d.ClinicId).SingleAsync()))
            .ShouldBe(s.A.Id);
        await (await bOwner.GetAsync($"/api/v1/drugs/{created.Id}")).ShouldBeProblemAsync(HttpStatusCode.NotFound, "notFound");
        var bSearch = await (await bOwner.GetAsync($"/api/v1/drugs?search={Uri.EscapeDataString(created.Name)}")).ReadAsync<PagedResult<DrugDto>>();
        bSearch.Items.ShouldBeEmpty();
    }

    [Fact]
    [Trait("Case", "ISO-016")]
    public async Task A_new_protocol_and_each_of_its_lines_are_stored_in_the_callers_clinic()
    {
        var s = await TwoClinicsAsync();
        var second = await Data.Drug(s.A);

        var created = await (await s.Caller.PostAsync("/api/v1/protocols", CatalogRoutes.ProtocolBody(s.ADrug.Id, second.Id)))
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
        await (await owner.PutAsync($"/api/v1/drugs/{templateDrug.Id}", DrugBody("Hijacked " + Guid.NewGuid())))
            .ShouldBeProblemAsync(HttpStatusCode.NotFound, "notFound");
        await (await owner.DeleteAsync($"/api/v1/drugs/{templateDrug.Id}")).ShouldBeProblemAsync(HttpStatusCode.NotFound, "notFound");
        await (await owner.GetAsync($"/api/v1/protocols/{templateProtocol.Id}")).ShouldBeProblemAsync(HttpStatusCode.NotFound, "notFound");
        await (await owner.PutAsync($"/api/v1/protocols/{templateProtocol.Id}", CatalogRoutes.ProtocolBody((await Data.Drug(a)).Id)))
            .ShouldBeProblemAsync(HttpStatusCode.NotFound, "notFound");
        await (await owner.DeleteAsync($"/api/v1/protocols/{templateProtocol.Id}")).ShouldBeProblemAsync(HttpStatusCode.NotFound, "notFound");

        // A's own list holds its copy, no template row
        var drugs = await ListAsync(owner, "source=own&pageSize=100");
        var protocols = await (await owner.GetAsync("/api/v1/protocols?pageSize=100")).ReadAsync<PagedResult<ProtocolDto>>();
        drugs.Items.ShouldNotContain(d => d.Id == templateDrug.Id);
        protocols.Items.ShouldNotContain(g => g.Id == templateProtocol.Id);
        drugs.Items.ShouldContain(d => d.Name == templateDrug.Name);
        protocols.Items.ShouldContain(g => g.Name == templateProtocol.Name);
        (await DrugNameAsync(templateDrug.Id)).ShouldBe(templateDrug.Name);
        (await ProtocolNameAsync(templateProtocol.Id)).ShouldBe(templateProtocol.Name);
        // Shared drugs are the same rows in A and in the template (not copies)
        var shared = await Data.Shared("VIGAMOX 0.5% EYE DROPS 5 ML");
        var inTemplate = await Login.SuperAdminInTemplateAsync();
        (await (await owner.GetAsync($"/api/v1/drugs/{shared.Id}")).ReadAsync<DrugDto>()).Id.ShouldBe(shared.Id);
        (await (await inTemplate.GetAsync($"/api/v1/drugs/{shared.Id}")).ReadAsync<DrugDto>()).Id.ShouldBe(shared.Id);
        (await App.QueryDbAsync(db => db.Drugs.IgnoreQueryFilters().CountAsync(d => d.Name == shared.Name && d.ClinicId != null)))
            .ShouldBe(0, "no clinic holds a copy of a shared drug");
    }

    [Fact]
    [Trait("Case", "ISO-018")]
    public async Task A_drugs_protocols_name_only_the_clinics_protocols()
    {
        var s = await TwoClinicsAsync();
        var second = await Data.Protocol(s.A).With(s.ADrug);

        var names = await (await s.Caller.GetAsync($"/api/v1/drugs/{s.ADrug.Id}/protocols")).ReadAsync<List<string>>();

        names.ShouldBe([s.AProtocol.Name, second.Name], ignoreOrder: true);
        names.ShouldNotContain(s.BProtocol.Name);
    }

    [Fact]
    [Trait("Tier", "Smoke")]
    [Trait("Case", "ISO-044")]
    public async Task Another_clinics_own_drug_answers_every_drug_route_exactly_like_a_missing_id()
    {
        var s = await TwoClinicsAsync();
        const int neverExisted = 2_147_483_000;
        var bOwner = await Login.OwnerAsync(s.B);

        foreach (var (name, call) in new (string, Func<int, Task<HttpResponseMessage>>)[]
        {
            ("GET", id => bOwner.GetAsync($"/api/v1/drugs/{id}")),
            ("PUT", id => bOwner.PutAsync($"/api/v1/drugs/{id}", DrugBody("Hijacked " + Guid.NewGuid()))),
            ("DELETE", id => bOwner.DeleteAsync($"/api/v1/drugs/{id}")),
        })
        {
            var other = await (await call(s.ADrug.Id)).ShouldBeProblemAsync(HttpStatusCode.NotFound, "notFound");
            var missing = await (await call(neverExisted)).ShouldBeProblemAsync(HttpStatusCode.NotFound, "notFound");
            Comparable(other).ShouldBe(Comparable(missing), name);
        }
        var protocols = await bOwner.GetAsync($"/api/v1/drugs/{s.ADrug.Id}/protocols");
        var missingProtocols = await bOwner.GetAsync($"/api/v1/drugs/{neverExisted}/protocols");
        await protocols.ShouldBeOkAsync();
        await missingProtocols.ShouldBeOkAsync();
        (await protocols.ReadAsync<List<string>>()).ShouldBeEmpty();
        (await missingProtocols.ReadAsync<List<string>>()).ShouldBeEmpty();
        (await DrugNameAsync(s.ADrug.Id)).ShouldBe(s.ADrug.Name);
        (await LineDrugIdsAsync(s.AProtocol.Id)).ShouldBe([s.ADrug.Id]);
    }

    [Fact]
    [Trait("Tier", "Smoke")]
    [Trait("Case", "ISO-045")]
    public async Task A_protocol_with_another_clinics_own_drug_is_400_drugNotFound_and_with_a_shared_drug_201()
    {
        var s = await TwoClinicsAsync();
        var bOwner = await Login.OwnerAsync(s.B);
        var shared = await Data.Shared("VIGAMOX 0.5% EYE DROPS 5 ML");
        var before = await ProtocolCountAsync(s.B.Id);

        var refused = await bOwner.PostAsync("/api/v1/protocols", CatalogRoutes.ProtocolBody(s.BDrug.Id, s.ADrug.Id));
        var created = await bOwner.PostAsync("/api/v1/protocols", CatalogRoutes.ProtocolBody(s.BDrug.Id, shared.Id));

        await refused.ShouldBeProblemAsync(HttpStatusCode.BadRequest, "drugNotFound");
        await created.ShouldBeAsync(HttpStatusCode.Created);
        (await created.ReadAsync<ProtocolDto>()).Items.Select(i => i.Drug.Id).ShouldBe([s.BDrug.Id, shared.Id]);
        (await ProtocolCountAsync(s.B.Id)).ShouldBe(before + 1);
    }

    /// <summary>A valid drug body (the category is required since M1.7: Eye › Glaucoma, design M1.7 D12).</summary>
    private static object DrugBody(string name) =>
        new { name, categoryId = CategoryIds.Eye, subCategoryId = SubCategoryIds.Glaucoma };

    private static async Task<PagedResult<DrugDto>> ListAsync(ApiClient client, string query)
    {
        var response = await client.GetAsync($"/api/v1/drugs?{query}");
        await response.ShouldBeOkAsync();
        return await response.ReadAsync<PagedResult<DrugDto>>();
    }

    private static string Comparable(Problem problem) =>
        $"{problem.Type}|{problem.Title}|{problem.Status}|{problem.Detail}|{problem.Code}|" +
        string.Join(";", problem.Errors.Select(e => $"{e.Code}:{e.Description}:{e.Field}")) +
        $"|{problem.ClinicNames is null}";

    private Task<List<int>> DrugIdsAsync(int clinicId) =>
        App.QueryDbAsync(db => db.Drugs.IgnoreQueryFilters().Where(d => d.ClinicId == clinicId).Select(d => d.Id).ToListAsync());

    private Task<string> DrugNameAsync(int drugId) =>
        App.QueryDbAsync(db => db.Drugs.IgnoreQueryFilters().Where(d => d.Id == drugId).Select(d => d.Name).SingleOrDefaultAsync());

    private Task<string> ProtocolNameAsync(int protocolId) =>
        App.QueryDbAsync(db => db.Protocols.IgnoreQueryFilters().Where(g => g.Id == protocolId).Select(g => g.Name).SingleOrDefaultAsync());

    private Task<int> ProtocolCountAsync(int clinicId) =>
        App.QueryDbAsync(db => db.Protocols.IgnoreQueryFilters().CountAsync(g => g.ClinicId == clinicId));

    private Task<List<int>> LineDrugIdsAsync(int protocolId) =>
        App.QueryDbAsync(db => db.ProtocolItems.IgnoreQueryFilters().Where(i => i.ProtocolId == protocolId)
            .OrderBy(i => i.Order).Select(i => i.DrugId).ToListAsync());
}
