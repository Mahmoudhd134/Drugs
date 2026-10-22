using System.Net;
using ClinicHub.Application.Common.Paging;
using ClinicHub.Application.Features.Catalog.Categories;
using ClinicHub.Application.Features.Catalog.Drugs;
using ClinicHub.Application.Features.Catalog.Protocols;
using ClinicHub.Application.Features.Platform.SharedDrugs;
using ClinicHub.IntegrationTests.Harness.Assertions;
using ClinicHub.IntegrationTests.Harness.Builders;
using ClinicHub.IntegrationTests.Harness.Clients;
using ClinicHub.IntegrationTests.Harness.Databases;
using ClinicHub.IntegrationTests.Harness.Hosting;
using Microsoft.EntityFrameworkCore;
using Shouldly;

namespace ClinicHub.IntegrationTests.Catalog.Journeys;

/// <summary>
/// The api level of the shared catalog cases whose screens are proven in ClinicHub.Web (design M1.7 D3, D6, D7, D8, § 8;
/// test cases CAT-046, CAT-062, CAT-073, CAT-155, CAT-163, CAT-175, CAT-187). Imported drugs are read by exact name;
/// every write is on a shared drug, category or subcategory of the test's own (design D12). The literal catalog numbers
/// are asserted here (the e2e specs compare with the API instead).
/// </summary>
[Collection(CatalogJourneysCollection.Name)]
[Trait("Area", "catalog")]
public class SharedCatalogJourneyTests(AppFixture app) : IntegrationTest(app)
{
    private const string DrugsUrl = "/api/v1/drugs";
    private const string ProtocolsUrl = "/api/v1/protocols";

    private static async Task<PagedResult<DrugDto>> ListAsync(ApiClient client, string query)
    {
        var response = await client.GetAsync($"{DrugsUrl}?{query}");
        await response.ShouldBeOkAsync();
        return await response.ReadAsync<PagedResult<DrugDto>>();
    }

    private static object OwnDrugBody(string name, int? categoryId, int? subCategoryId) =>
        new { name, activeIngredients = (string)null, description = (string)null, defaultDosing = (object)null, categoryId, subCategoryId };

    private static object ProtocolBody(string name, params int[] drugIds) =>
        new { name, items = drugIds.Select(id => new { drugId = id, dosing = (object)null }).ToArray() };

    private static async Task<ProtocolDto> GetProtocolAsync(ApiClient client, int id)
    {
        var response = await client.GetAsync($"{ProtocolsUrl}/{id}");
        await response.ShouldBeOkAsync();
        return await response.ReadAsync<ProtocolDto>();
    }

    [Fact]
    [Trait("Case", "CAT-046")]
    public async Task A_category_deleted_between_opening_the_form_and_saving_answers_400_categoryNotFound_on_categoryId()
    {
        var clinic = await Data.Clinic();
        var owner = await Login.OwnerAsync(clinic);
        var category = await Data.Category();
        // The form was opened with it: the clinic's list holds it
        var categories = await (await owner.GetAsync("/api/v1/drug-categories")).ReadAsync<List<CategoryDto>>();
        categories.Select(c => c.Id).ShouldContain(category.Id);

        var superAdmin = await Login.SuperAdminAsync();
        await (await superAdmin.DeleteAsync($"/api/v1/admin/drug-categories/{category.Id}")).ShouldBeAsync(HttpStatusCode.NoContent);
        var response = await owner.PostAsync(DrugsUrl, OwnDrugBody(Unique.Name("Drug", "دواء"), category.Id, null));

        var problem = await response.ShouldBeProblemAsync(HttpStatusCode.BadRequest, "categoryNotFound");
        problem.ShouldHaveError("categoryId", "categoryNotFound");
        (await App.QueryDbAsync(db => db.Drugs.IgnoreQueryFilters().CountAsync(d => d.ClinicId == clinic.Id && d.CategoryId == category.Id)))
            .ShouldBe(0);
    }

    [Fact]
    [Trait("Case", "CAT-062")]
    public async Task The_hidden_Arabic_name_finds_both_ALEMOX_drugs_and_the_answer_carries_only_their_English_names()
    {
        var clinic = await Data.Clinic();
        var owner = await Login.OwnerAsync(clinic);

        var response = await owner.GetAsync($"{DrugsUrl}?search={Uri.EscapeDataString("أليموكس")}&pageSize=100");
        await response.ShouldBeOkAsync();
        var body = await response.ReadNodeAsync();
        var names = body["items"]!.AsArray().Select(i => (string)i!["name"]).ToList();
        names.ShouldContain("ALEMOX 1 GM 12 F.C.TABS.");
        names.ShouldContain("ALEMOX 750 MG 12 F.C.TABS.");
        // Never the Arabic name: no `nameAr` (nor any other field) holds it
        foreach (var item in body["items"]!.AsArray())
            item!.AsObject().ContainsKey("nameAr").ShouldBeFalse();
        body.ToJsonString().ShouldNotContain("أليموكس");
    }

    [Fact]
    [Trait("Case", "CAT-073")]
    public async Task Glaucoma_or_its_Arabic_name_finds_the_91_shared_drugs_of_Eye_Glaucoma_after_the_clinics_own_and_qatra_in_B_finds_nothing()
    {
        var clinic = await Data.Clinic();
        var own = await Data.Drug(clinic).Named(Unique.Name("Own drops", "خاص"));
        var owner = await Login.OwnerAsync(clinic);
        var inSubcategory = await ListAsync(owner, $"categoryId={CategoryIds.Eye}&subCategoryId={SubCategoryIds.Glaucoma}&source=shared&pageSize=100");
        inSubcategory.TotalCount.ShouldBe(91);

        foreach (var term in new[] { "glaucoma", "المياه الزرقاء" })
        {
            var shared = await ListAsync(owner, $"search={Uri.EscapeDataString(term)}&source=shared&pageSize=100");
            shared.TotalCount.ShouldBe(91, term);
            // The same drugs in the same (name) order as the subcategory itself
            shared.Items.Select(d => d.Id).ShouldBe(inSubcategory.Items.Select(d => d.Id), term);
            shared.Items.ShouldAllBe(d => d.Category.Id == CategoryIds.Eye && d.SubCategory.Id == SubCategoryIds.Glaucoma);

            // With the clinic's own drugs: its own drug of that subcategory first
            var all = await ListAsync(owner, $"search={Uri.EscapeDataString(term)}&pageSize=100");
            all.Items.First().Id.ShouldBe(own.Id, term);
            all.Items.Where(d => d.IsShared).Select(d => d.Id).ShouldBe(inSubcategory.Items.Select(d => d.Id), term);
        }

        // «قطرة» in a clinic with no own drug containing it (no shared Arabic name contains it)
        var clinicB = await Data.Clinic();
        var ownerB = await Login.OwnerAsync(clinicB);
        var ownOfB = await ListAsync(ownerB, $"search={Uri.EscapeDataString("قطرة")}&source=own");
        ownOfB.TotalCount.ShouldBe(0, "precondition: B has no own drug named «قطرة…»");
        (await ListAsync(ownerB, $"search={Uri.EscapeDataString("قطرة")}")).TotalCount.ShouldBe(0);
    }

    [Fact]
    [Trait("Case", "CAT-155")]
    public async Task A_second_tab_saving_a_withdrawn_line_removed_meanwhile_gets_400_drugWithdrawn_on_that_line()
    {
        var clinic = await Data.Clinic();
        var own = await Data.Drug(clinic);
        var shared = await Data.SharedDrug();
        var protocol = await Data.Protocol(clinic).With(own.Id).With(shared.Id);
        await Data.WithdrawSharedDrugAsync(shared.Id);
        var tab1 = await Login.OwnerAsync(clinic);
        var tab2 = await Login.OwnerAsync(clinic);

        await (await tab1.PutAsync($"{ProtocolsUrl}/{protocol.Id}", ProtocolBody(protocol.Name, own.Id))).ShouldBeOkAsync();
        var response = await tab2.PutAsync($"{ProtocolsUrl}/{protocol.Id}", ProtocolBody(protocol.Name, own.Id, shared.Id));

        var problem = await response.ShouldBeProblemAsync(HttpStatusCode.BadRequest, "drugWithdrawn");
        problem.ShouldHaveError("items[1].drugId", "drugWithdrawn");
        (await GetProtocolAsync(tab1, protocol.Id)).Items.Select(i => i.Drug.Id).ShouldBe([own.Id]);
    }

    [Fact]
    [Trait("Case", "CAT-163")]
    public async Task A_withdrawn_drug_restored_is_back_in_lists_counts_and_search_of_every_clinic_and_its_lines_lose_the_withdrawn_flag()
    {
        var sub = await Data.SubCategory();
        var name = Unique.Name("Restored drops", "مستعاد");
        var shared = await Data.SharedDrug().Named(name).InCategory(CategoryIds.Eye, sub.Id);
        var clinicA = await Data.Clinic();
        var clinicB = await Data.Clinic();
        var protocol = await Data.Protocol(clinicA).With(shared.Id);
        var ownerA = await Login.OwnerAsync(clinicA);
        var ownerB = await Login.OwnerAsync(clinicB);
        var bucket = $"categoryId={CategoryIds.Eye}&subCategoryId={sub.Id}";
        var sharedTotal = (await ListAsync(ownerA, "source=shared&pageSize=1")).TotalCount;

        await Data.WithdrawSharedDrugAsync(shared.Id);
        foreach (var owner in new[] { ownerA, ownerB })
        {
            (await ListAsync(owner, bucket)).TotalCount.ShouldBe(0);
            (await ListAsync(owner, $"search={Uri.EscapeDataString(name)}")).Items.ShouldNotContain(d => d.Id == shared.Id);
        }
        (await ListAsync(ownerA, "source=shared&pageSize=1")).TotalCount.ShouldBe(sharedTotal - 1);
        (await GetProtocolAsync(ownerA, protocol.Id)).Items.Single().Drug.Withdrawn.ShouldBeTrue();

        await Data.RestoreSharedDrugAsync(shared.Id);
        foreach (var owner in new[] { ownerA, ownerB })
        {
            (await ListAsync(owner, bucket)).Items.Select(d => d.Id).ShouldBe([shared.Id]);
            (await ListAsync(owner, $"search={Uri.EscapeDataString(name)}")).Items.ShouldContain(d => d.Id == shared.Id && !d.Withdrawn);
        }
        (await ListAsync(ownerA, "source=shared&pageSize=1")).TotalCount.ShouldBe(sharedTotal);
        var line = (await GetProtocolAsync(ownerA, protocol.Id)).Items.Single();
        line.Drug.Id.ShouldBe(shared.Id);
        line.Drug.Withdrawn.ShouldBeFalse();
        // A new protocol may take it again (no `drugWithdrawn`)
        await (await ownerB.PostAsync(ProtocolsUrl, ProtocolBody(Unique.Name("Protocol", "بروتوكول"), shared.Id))).ShouldBeAsync(HttpStatusCode.Created);
    }

    [Fact]
    [Trait("Case", "CAT-175")]
    public async Task A_shared_drug_renamed_by_the_super_admin_shows_its_new_name_in_the_clinics_protocol()
    {
        var clinic = await Data.Clinic();
        var shared = await Data.SharedDrug();
        var protocol = await Data.Protocol(clinic).With(shared.Id);
        var renamed = Unique.Name("Renamed drops", "معدل");
        await Data.UpdateSharedDrugAsync(shared.Id, renamed);
        var owner = await Login.OwnerAsync(clinic);

        (await GetProtocolAsync(owner, protocol.Id)).Items.Single().Drug.Name.ShouldBe(renamed);
        var list = await owner.GetAsync($"{ProtocolsUrl}?search={Uri.EscapeDataString(protocol.Name)}");
        await list.ShouldBeOkAsync();
        var page = await list.ReadAsync<PagedResult<ProtocolDto>>();
        page.Items.Single(p => p.Id == protocol.Id).Items.Single().Drug.Name.ShouldBe(renamed);
    }

    [Fact]
    [Trait("Case", "CAT-187")]
    public async Task A_test_made_shared_drug_with_an_imported_drugs_exact_fields_saved_unchanged_answers_200_and_nothing_changes()
    {
        // The imported drug with the longest ingredients (397 characters, design D11): read only
        var maxImported = TestRun.Baseline.MaxDrugId;
        var source = await App.QueryDbAsync(db => db.Drugs.IgnoreQueryFilters().AsNoTracking()
            .Where(d => d.ClinicId == null && d.Id <= maxImported && d.ActiveIngredients != null)
            .OrderByDescending(d => d.ActiveIngredients.Length).ThenBy(d => d.Id)
            .Select(d => new { d.Name, d.ActiveIngredients, d.CategoryId, d.SubCategoryId })
            .FirstAsync());
        source.ActiveIngredients.Length.ShouldBe(397);
        var copy = await Data.SharedDrug().Named(source.Name).WithIngredients(source.ActiveIngredients)
            .InCategory(source.CategoryId, source.SubCategoryId);
        var superAdmin = await Login.SuperAdminAsync();
        var before = await (await superAdmin.GetAsync($"/api/v1/admin/drugs/{copy.Id}")).ReadAsync<AdminDrugDto>();

        // The dialog sends back what it was given
        var response = await superAdmin.PutAsync($"/api/v1/admin/drugs/{copy.Id}", new
        {
            name = before.Name,
            activeIngredients = before.ActiveIngredients,
            description = before.Description,
            categoryId = before.Category.Id,
            subCategoryId = before.SubCategory?.Id,
        });

        await response.ShouldBeOkAsync();
        var after = await (await superAdmin.GetAsync($"/api/v1/admin/drugs/{copy.Id}")).ReadAsync<AdminDrugDto>();
        after.ShouldBe(before);
        after.Name.ShouldBe(source.Name);
        after.ActiveIngredients.ShouldBe(source.ActiveIngredients);
        var stored = await App.QueryDbAsync(db => db.Drugs.IgnoreQueryFilters().AsNoTracking().Where(d => d.Id == copy.Id)
            .Select(d => new { d.Name, d.ActiveIngredients, d.CategoryId, d.SubCategoryId }).SingleAsync());
        stored.ShouldBe(source);
    }
}
