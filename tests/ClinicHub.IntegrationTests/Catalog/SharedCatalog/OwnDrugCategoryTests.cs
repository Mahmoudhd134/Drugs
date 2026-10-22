using System.Net;
using System.Text.Json.Nodes;
using ClinicHub.Application.Features.Access;
using ClinicHub.Application.Features.Catalog.Categories;
using ClinicHub.Application.Features.Catalog.Drugs;
using ClinicHub.IntegrationTests.Harness.Assertions;
using ClinicHub.IntegrationTests.Harness.Builders;
using ClinicHub.IntegrationTests.Harness.Hosting;
using Microsoft.EntityFrameworkCore;
using Shouldly;

namespace ClinicHub.IntegrationTests.Catalog.SharedCatalog;

/// <summary>
/// An own drug's new fields (design M1.7 D3; § 7): a required category, an optional subcategory of that category, the
/// optional one-line active ingredients; no Arabic name in any body or answer (D3, D8); and <c>GET /drug-categories</c>
/// (D5, D8). No test of this class creates a category.
/// </summary>
[Collection(CatalogCollection.Name)]
[Trait("Area", "catalog")]
public class OwnDrugCategoryTests(AppFixture app) : CatalogTest(app)
{
    [Fact]
    [Trait("Tier", "Smoke")]
    [Trait("Case", "CAT-037")]
    public async Task A_drug_without_a_category_is_400_categoryRequired_on_categoryId()
    {
        var owner = await OwnerAsync();

        var response = await owner.PostAsync(DrugsUrl, DrugBody(Unique.Name("Tobradex", "توبرادكس"), categoryId: null, subCategoryId: null));

        (await response.ShouldBeProblemAsync(HttpStatusCode.BadRequest, "categoryRequired")).ShouldHaveError("categoryId", "categoryRequired");
    }

    [Theory]
    [Trait("Case", "CAT-038")]
    [InlineData(0)]
    [InlineData(-1)]
    [InlineData(int.MaxValue)]
    public async Task A_category_that_does_not_exist_is_400_categoryNotFound_on_categoryId(int categoryId)
    {
        var owner = await OwnerAsync();
        var name = Unique.Name("Tobradex", "توبرادكس");

        var response = await owner.PostAsync(DrugsUrl, DrugBody(name, categoryId: categoryId, subCategoryId: null));

        (await response.ShouldBeProblemAsync(HttpStatusCode.BadRequest, "categoryNotFound")).ShouldHaveError("categoryId", "categoryNotFound");
        (await ListOwnDrugsAsync(owner, $"search={Uri.EscapeDataString(name)}")).TotalCount.ShouldBe(0);
    }

    [Fact]
    [Trait("Tier", "Smoke")]
    [Trait("Case", "CAT-039")]
    public async Task A_subcategory_of_another_category_is_400_subCategoryNotFound_and_nothing_is_saved()
    {
        var owner = await OwnerAsync();
        var name = Unique.Name("Tobradex", "توبرادكس");

        var response = await owner.PostAsync(DrugsUrl, DrugBody(name, categoryId: CategoryIds.Eye, subCategoryId: SubCategoryIds.Unclassified));

        (await response.ShouldBeProblemAsync(HttpStatusCode.BadRequest, "subCategoryNotFound"))
            .ShouldHaveError("subCategoryId", "subCategoryNotFound");
        (await ListOwnDrugsAsync(owner, $"search={Uri.EscapeDataString(name)}")).TotalCount.ShouldBe(0);
        (await App.QueryDbAsync(db => db.Drugs.IgnoreQueryFilters().CountAsync(d => d.Name == name))).ShouldBe(0);
    }

    [Fact]
    [Trait("Tier", "Smoke")]
    [Trait("Case", "CAT-040")]
    public async Task A_drug_without_a_subcategory_is_created_and_listed_under_no_subcategory()
    {
        var owner = await OwnerAsync();

        var response = await owner.PostAsync(DrugsUrl, DrugBody(Unique.Name("Tobradex", "توبرادكس"), categoryId: CategoryIds.Eye, subCategoryId: null));

        await response.ShouldBeAsync(HttpStatusCode.Created);
        var node = (await response.ReadNodeAsync()).AsObject();
        node.ContainsKey("subCategory").ShouldBeTrue();
        node["subCategory"].ShouldBeNull();
        var created = await response.ReadAsync<DrugDto>();
        created.Category.Id.ShouldBe(CategoryIds.Eye);
        (await GetDrugAsync(owner, created.Id)).SubCategory.ShouldBeNull();
        (await ListOwnDrugsAsync(owner, $"categoryId={CategoryIds.Eye}&subCategoryId=none&pageSize=100")).Items
            .ShouldContain(d => d.Id == created.Id);
        (await ListOwnDrugsAsync(owner, $"categoryId={CategoryIds.Eye}&subCategoryId={SubCategoryIds.Glaucoma}&pageSize=100")).Items
            .ShouldNotContain(d => d.Id == created.Id);
    }

    [Fact]
    [Trait("Case", "CAT-041")]
    public async Task Moving_a_drug_to_another_category_keeping_its_subcategory_is_400_subCategoryNotFound()
    {
        var clinic = await SharedClinicAsync();
        var owner = await OwnerAsync();
        var drug = await Data.Drug(clinic);
        var antiInfectives = await CategoryIdAsync(owner, ImportedDrugs.AntiInfectivesAr);

        var response = await owner.PutAsync($"{DrugsUrl}/{drug.Id}",
            DrugBody(drug.Name, categoryId: antiInfectives, subCategoryId: SubCategoryIds.Glaucoma));

        (await response.ShouldBeProblemAsync(HttpStatusCode.BadRequest, "subCategoryNotFound"))
            .ShouldHaveError("subCategoryId", "subCategoryNotFound");
        var stored = await GetDrugAsync(owner, drug.Id);
        stored.Category.Id.ShouldBe(CategoryIds.Eye);
        stored.SubCategory.ShouldNotBeNull().Id.ShouldBe(SubCategoryIds.Glaucoma);
        // Clearing the subcategory moves it
        await (await owner.PutAsync($"{DrugsUrl}/{drug.Id}", DrugBody(drug.Name, categoryId: antiInfectives, subCategoryId: null)))
            .ShouldBeOkAsync();
        (await GetDrugAsync(owner, drug.Id)).Category.Id.ShouldBe(antiInfectives);
    }

    [Fact]
    [Trait("Case", "CAT-042")]
    public async Task Every_failing_rule_is_reported_in_order_ending_with_categoryRequired()
    {
        var owner = await OwnerAsync();

        var response = await owner.PostAsync(DrugsUrl,
            DrugBody("", "bad\0text", new { doseAmount = 1 }, categoryId: null, subCategoryId: null));

        var problem = await response.ShouldBeProblemAsync(HttpStatusCode.BadRequest, "nameRequired");
        problem.Errors.Select(e => (e.Code, e.Field)).ShouldBe([
            ("nameRequired", "name"), ("invalidText", "description"), ("invalidDosing", "defaultDosing"), ("categoryRequired", "categoryId"),
        ]);
    }

    [Theory]
    [Trait("Case", "CAT-043")]
    [InlineData("AMOXICILLIN\nCLAVULANIC ACID")]
    [InlineData("AMOXICILLIN\tCLAVULANIC ACID")]
    [InlineData("AMOXICILLIN\r\nCLAVULANIC ACID")]
    [InlineData("AMOXI\0CILLIN")]
    public async Task Ingredients_with_a_control_character_are_400_invalidText_on_activeIngredients(string ingredients)
    {
        var owner = await OwnerAsync();

        var response = await owner.PostAsync(DrugsUrl, DrugBody(Unique.Name("Tobradex", "توبرادكس"), activeIngredients: ingredients));

        (await response.ShouldBeProblemAsync(HttpStatusCode.BadRequest, "invalidText")).ShouldHaveError("activeIngredients", "invalidText");
    }

    [Fact]
    [Trait("Case", "CAT-043")]
    public async Task Ingredients_are_at_most_1000_characters_after_trimming()
    {
        var owner = await OwnerAsync();
        var thousand = "A" + new string('x', 998) + "Z";

        var tooLong = await owner.PostAsync(DrugsUrl, DrugBody(Unique.Name("Tobradex", "توبرادكس"), activeIngredients: thousand + "x"));
        var atLimit = await owner.PostAsync(DrugsUrl, DrugBody(Unique.Name("Tobradex", "توبرادكس"), activeIngredients: thousand));
        var padded = await owner.PostAsync(DrugsUrl, DrugBody(Unique.Name("Tobradex", "توبرادكس"), activeIngredients: $"  {thousand} "));

        (await tooLong.ShouldBeProblemAsync(HttpStatusCode.BadRequest, "textTooLong")).ShouldHaveError("activeIngredients", "textTooLong");
        await atLimit.ShouldBeAsync(HttpStatusCode.Created);
        (await atLimit.ReadAsync<DrugDto>()).ActiveIngredients.ShouldBe(thousand);
        await padded.ShouldBeAsync(HttpStatusCode.Created);
    }

    [Theory]
    [Trait("Case", "CAT-044")]
    [InlineData("  AMOXICILLIN+CLAVULANIC ACID  ", "AMOXICILLIN+CLAVULANIC ACID")]
    [InlineData("بنسلين  طويل المفعول", "بنسلين  طويل المفعول")]
    [InlineData("   ", null)]
    public async Task Ingredients_are_read_back_trimmed_exactly_as_typed(string typed, string stored)
    {
        var owner = await OwnerAsync();

        var response = await owner.PostAsync(DrugsUrl, DrugBody(Unique.Name("Tobradex", "توبرادكس"), activeIngredients: typed));

        await response.ShouldBeAsync(HttpStatusCode.Created);
        var created = await response.ReadAsync<DrugDto>();
        created.ActiveIngredients.ShouldBe(stored);
        (await GetDrugAsync(owner, created.Id)).ActiveIngredients.ShouldBe(stored);
    }

    [Fact]
    [Trait("Case", "CAT-045")]
    public async Task A_nameAr_property_is_ignored_and_no_answer_carries_a_drugs_Arabic_name()
    {
        var clinic = await SharedClinicAsync();
        var owner = await OwnerAsync();
        var admin = await Login.SuperAdminAsync();
        var alemox = await Data.Shared(ImportedDrugs.Alemox1Gm);
        await Data.Protocol(clinic).With(alemox.Id);
        const string hiddenName = "أليموكس";

        var created = await owner.PostAsync(DrugsUrl,
            new { name = Unique.Name("Tobradex", "توبرادكس"), nameAr = "توبراديكس", categoryId = CategoryIds.Eye });
        await created.ShouldBeAsync(HttpStatusCode.Created);
        var own = await created.ReadAsync<DrugDto>();
        var updated = await owner.PutAsync($"{DrugsUrl}/{own.Id}", new { name = own.Name, nameAr = "توبراديكس", categoryId = CategoryIds.Eye });
        await updated.ShouldBeOkAsync();
        var adminCreated = await admin.PostAsync("/api/v1/admin/drugs",
            new { name = Unique.Name("Shared drug", "مشترك"), nameAr = "مشترك سري", categoryId = CategoryIds.Eye });
        await adminCreated.ShouldBeAsync(HttpStatusCode.Created);
        var sharedId = (await adminCreated.ReadNodeAsync())["id"]!.GetValue<int>();
        var adminUpdated = await admin.PutAsync($"/api/v1/admin/drugs/{sharedId}",
            new { name = Unique.Name("Shared drug", "مشترك"), nameAr = "مشترك سري", categoryId = CategoryIds.Eye });
        await adminUpdated.ShouldBeOkAsync();

        (await App.QueryDbAsync(db => db.Drugs.IgnoreQueryFilters().Where(d => d.Id == own.Id || d.Id == sharedId)
            .Select(d => d.NameAr).ToListAsync())).ShouldAllBe(nameAr => nameAr == null);
        var answers = new List<HttpResponseMessage>
        {
            created, updated, adminCreated, adminUpdated,
            await owner.GetAsync($"{DrugsUrl}/{alemox.Id}"),
            await owner.GetAsync($"{DrugsUrl}?search={Uri.EscapeDataString(hiddenName)}"),
            await owner.GetAsync($"{ProtocolsUrl}?pageSize=100"),
            await admin.GetAsync($"/api/v1/admin/drugs/{alemox.Id}"),
            await admin.GetAsync($"/api/v1/admin/drugs?search={Uri.EscapeDataString(hiddenName)}"),
        };
        var protocols = await ListProtocolsAsync(owner, "pageSize=100");
        foreach (var protocol in protocols.Items)
            answers.Add(await owner.GetAsync($"{ProtocolsUrl}/{protocol.Id}"));
        foreach (var answer in answers)
        {
            var text = await answer.Content.ReadAsStringAsync();
            var where = answer.RequestMessage?.RequestUri?.PathAndQuery;
            text.ShouldNotContain(hiddenName, Case.Sensitive, where);
            text.ShouldNotContain("توبراديكس", Case.Sensitive, where);
            text.ShouldNotContain("مشترك سري", Case.Sensitive, where);
            foreach (var drug in DrugObjects(JsonNode.Parse(text)))
                drug.ContainsKey("nameAr").ShouldBeFalse($"{where}: a drug object with nameAr");
        }
    }

    [Fact]
    [Trait("Tier", "Smoke")]
    [Trait("Case", "CAT-047")]
    public async Task The_categories_are_listed_with_all_their_subcategories_both_names_and_only_two_pins()
    {
        var owner = await OwnerAsync();
        var baseline = Harness.Databases.TestRun.Baseline;

        var response = await owner.GetAsync(CategoriesUrl);

        await response.ShouldBeOkAsync();
        var text = await response.Content.ReadAsStringAsync();
        text.ShouldNotContain("drugCount", Case.Insensitive);
        text.ShouldNotContain("clinicId", Case.Insensitive);
        var categories = await response.ReadAsync<List<CategoryDto>>();
        categories.Count.ShouldBe(baseline.MaxCategoryId);
        categories.SelectMany(c => c.SubCategories).Count().ShouldBe(baseline.MaxSubCategoryId);
        categories.Select(c => c.Id).Order().ShouldBe(Enumerable.Range(1, baseline.MaxCategoryId));
        categories.ShouldAllBe(c => !string.IsNullOrWhiteSpace(c.NameEn) && !string.IsNullOrWhiteSpace(c.NameAr));
        categories.SelectMany(c => c.SubCategories).ShouldAllBe(s => !string.IsNullOrWhiteSpace(s.NameEn) && !string.IsNullOrWhiteSpace(s.NameAr));
        categories.Where(c => c.PinnedLast).Select(c => c.Id).ShouldBe([CategoryIds.Other]);
        categories.SelectMany(c => c.SubCategories).Where(s => s.PinnedLast).Select(s => s.Id).ShouldBe([SubCategoryIds.Unclassified]);
        var eye = categories.Single(c => c.Id == CategoryIds.Eye);
        (eye.NameEn, eye.NameAr).ShouldBe(("Eye", ImportedDrugs.EyeAr));
        eye.SubCategories.Single(s => s.Id == SubCategoryIds.Glaucoma).NameAr.ShouldBe(ImportedDrugs.GlaucomaAr);
        categories.Single(c => c.Id == CategoryIds.Other).SubCategories.ShouldContain(s => s.Id == SubCategoryIds.Unclassified);
    }

    [Fact]
    [Trait("Case", "CAT-048")]
    public async Task Without_drugs_list_the_categories_are_403_forbidden()
    {
        var clinic = await SharedClinicAsync();
        var reader = await Login.WithPermissionsAsync(clinic, Permissions.Protocols.List);

        await (await reader.GetAsync(CategoriesUrl)).ShouldBeProblemAsync(HttpStatusCode.Forbidden, "forbidden");
        await (await reader.GetAsync(ProtocolsUrl)).ShouldBeOkAsync();
    }

    /// <summary>The JSON objects of an answer that are drugs (they carry <c>isShared</c> or <c>withdrawn</c> next to a name).</summary>
    private static IEnumerable<JsonObject> DrugObjects(JsonNode node)
    {
        switch (node)
        {
            case JsonObject obj:
                if (obj.ContainsKey("name") && (obj.ContainsKey("isShared") || obj.ContainsKey("withdrawn")))
                    yield return obj;
                foreach (var child in obj.Select(p => p.Value).Where(v => v is not null))
                    foreach (var found in DrugObjects(child))
                        yield return found;
                break;
            case JsonArray array:
                foreach (var child in array.Where(v => v is not null))
                    foreach (var found in DrugObjects(child))
                        yield return found;
                break;
        }
    }
}
