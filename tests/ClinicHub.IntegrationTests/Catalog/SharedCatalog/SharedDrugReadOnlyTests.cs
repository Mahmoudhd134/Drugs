using System.Net;
using ClinicHub.Application.Features.Catalog.Categories;
using ClinicHub.Application.Features.Catalog.Drugs;
using ClinicHub.IntegrationTests.Harness.Assertions;
using ClinicHub.IntegrationTests.Harness.Builders;
using ClinicHub.IntegrationTests.Harness.Hosting;
using Microsoft.EntityFrameworkCore;
using Shouldly;

namespace ClinicHub.IntegrationTests.Catalog.SharedCatalog;

/// <summary>
/// Shared drugs through the clinic API (design M1.7 D2, D3, D8; § 7): readable by every clinic, read-only for each
/// (409 <c>sharedDrugReadOnly</c>, checked last), the template included. Writes are attempted on test-created shared
/// drugs only (<c>Data.SharedDrug()</c>, D12), so a broken rule never touches an imported row.
/// </summary>
[Collection(CatalogGuardsCollection.Name)]
[Trait("Area", "catalog")]
public class SharedDrugReadOnlyTests(AppFixture app) : CatalogTest(app)
{
    [Fact]
    [Trait("Tier", "Smoke")]
    [Trait("Case", "CAT-013")]
    public async Task A_shared_drug_is_read_with_isShared_no_dosing_and_both_names_of_its_category_and_subcategory()
    {
        var owner = await OwnerAsync();
        var vigamox = await Data.Shared(ImportedDrugs.Vigamox);

        var response = await owner.GetAsync($"{DrugsUrl}/{vigamox.Id}");

        await response.ShouldBeOkAsync();
        var node = (await response.ReadNodeAsync()).AsObject();
        node["isShared"]!.GetValue<bool>().ShouldBeTrue();
        node["withdrawn"]!.GetValue<bool>().ShouldBeFalse();
        node.ContainsKey("defaultDosing").ShouldBeTrue("defaultDosing is returned (null)");
        node["defaultDosing"].ShouldBeNull();
        node.ContainsKey("nameAr").ShouldBeFalse("a drug's Arabic name is never exposed");
        var drug = await GetDrugAsync(owner, vigamox.Id);
        drug.Name.ShouldBe(ImportedDrugs.Vigamox);
        drug.ActiveIngredients.ShouldBe("MOXIFLOXACIN");
        drug.Category.ShouldBe(new CategoryNameDto(CategoryIds.Eye, "Eye", ImportedDrugs.EyeAr));
        drug.SubCategory.ShouldNotBeNull();
        drug.SubCategory.NameAr.ShouldBe(ImportedDrugs.EyeAntiInfectivesAr);
        drug.SubCategory.NameEn.ShouldNotBeNullOrWhiteSpace();
        (await CategoriesAsync(owner)).Single(c => c.Id == CategoryIds.Eye).SubCategories
            .ShouldContain(s => s.Id == drug.SubCategory.Id && s.NameEn == drug.SubCategory.NameEn);
    }

    [Fact]
    [Trait("Tier", "Smoke")]
    [Trait("Case", "CAT-019")]
    public async Task The_owner_updating_a_shared_drug_gets_409_sharedDrugReadOnly_and_it_is_unchanged_for_every_clinic()
    {
        var shared = await Data.SharedDrug().WithIngredients("TESTOLOL").Described("Shared description");
        var b = await Data.Clinic();
        var owner = await OwnerAsync();
        var stampBefore = await UpdatedAtAsync(shared.Id);
        Clock.Advance(TimeSpan.FromMinutes(1));

        var response = await owner.PutAsync($"{DrugsUrl}/{shared.Id}",
            DrugBody("Renamed by a clinic", "Changed", activeIngredients: "CHANGED"));

        await response.ShouldBeProblemAsync(HttpStatusCode.Conflict, "sharedDrugReadOnly");
        foreach (var client in new[] { owner, await Login.OwnerAsync(b) })
        {
            var read = await GetDrugAsync(client, shared.Id);
            read.Name.ShouldBe(shared.Name);
            read.Description.ShouldBe("Shared description");
            read.ActiveIngredients.ShouldBe("TESTOLOL");
        }
        (await UpdatedAtAsync(shared.Id)).ShouldBe(stampBefore);
    }

    [Fact]
    [Trait("Tier", "Smoke")]
    [Trait("Case", "CAT-020")]
    public async Task The_owner_deleting_a_shared_drug_gets_409_and_the_drug_and_every_protocol_line_on_it_stay()
    {
        var shared = await Data.SharedDrug();
        var a = await SharedClinicAsync();
        var b = await Data.Clinic();
        var aProtocol = await Data.Protocol(a).With(shared.Id).With(await Data.Drug(a));
        var bProtocol = await Data.Protocol(b).With(shared.Id);
        var owner = await OwnerAsync();
        var ownerB = await Login.OwnerAsync(b);

        var response = await owner.DeleteAsync($"{DrugsUrl}/{shared.Id}");

        await response.ShouldBeProblemAsync(HttpStatusCode.Conflict, "sharedDrugReadOnly");
        (await GetDrugAsync(owner, shared.Id)).Id.ShouldBe(shared.Id);
        (await GetDrugAsync(ownerB, shared.Id)).Id.ShouldBe(shared.Id);
        (await GetProtocolAsync(owner, aProtocol.Id)).Items.Select(i => i.Drug.Id).ShouldBe(aProtocol.Items.Select(i => i.Drug.Id));
        (await GetProtocolAsync(ownerB, bProtocol.Id)).Items.Select(i => i.Drug.Id).ShouldBe([shared.Id]);
    }

    [Fact]
    [Trait("Case", "CAT-021")]
    public async Task The_super_admin_in_the_template_gets_409_on_updating_or_deleting_a_shared_drug()
    {
        var shared = await Data.SharedDrug();
        var admin = await Login.SuperAdminInTemplateAsync();

        await (await admin.PutAsync($"{DrugsUrl}/{shared.Id}", DrugBody(Unique.Name("Renamed in the template", "قالب"))))
            .ShouldBeProblemAsync(HttpStatusCode.Conflict, "sharedDrugReadOnly");
        await (await admin.DeleteAsync($"{DrugsUrl}/{shared.Id}")).ShouldBeProblemAsync(HttpStatusCode.Conflict, "sharedDrugReadOnly");

        (await GetDrugAsync(admin, shared.Id)).Name.ShouldBe(shared.Name);
    }

    [Fact]
    [Trait("Case", "CAT-022")]
    public async Task Validation_and_the_category_checks_come_before_the_read_only_check()
    {
        var shared = await Data.SharedDrug();
        var owner = await OwnerAsync();

        var empty = await owner.PutAsync($"{DrugsUrl}/{shared.Id}", DrugBody(""));
        var unknownCategory = await owner.PutAsync($"{DrugsUrl}/{shared.Id}", DrugBody("Valid name", categoryId: UnknownId, subCategoryId: null));

        (await empty.ShouldBeProblemAsync(HttpStatusCode.BadRequest, "nameRequired")).ShouldHaveError("name", "nameRequired");
        (await unknownCategory.ShouldBeProblemAsync(HttpStatusCode.BadRequest, "categoryNotFound"))
            .ShouldHaveError("categoryId", "categoryNotFound");
    }

    [Fact]
    [Trait("Case", "CAT-023")]
    public async Task A_dosing_sent_for_a_shared_drug_is_refused_with_409_and_never_stored()
    {
        var shared = await Data.SharedDrug();
        var owner = await OwnerAsync();

        var response = await owner.PutAsync($"{DrugsUrl}/{shared.Id}", DrugBody(shared.Name, defaultDosing: Dosings.Drops()));

        await response.ShouldBeProblemAsync(HttpStatusCode.Conflict, "sharedDrugReadOnly");
        (await GetDrugAsync(owner, shared.Id)).DefaultDosing.ShouldBeNull();
        var stored = await App.QueryDbAsync(db => db.Drugs.IgnoreQueryFilters().AsNoTracking().SingleAsync(d => d.Id == shared.Id));
        stored.DefaultDosing.ShouldBeNull();
    }

    [Fact]
    [Trait("Case", "CAT-031")]
    public async Task The_protocols_of_a_shared_drug_are_only_the_clinics_own_protocols()
    {
        var shared = await Data.Shared(ImportedDrugs.Vigamox);
        var a = await SharedClinicAsync();
        var b = await Data.Clinic();
        var aProtocol = await Data.Protocol(a).Named(Unique.Name("Post cataract", "بعد المياه البيضاء")).With(shared.Id);
        await Data.Protocol(b).Named(Unique.Name("B protocol", "بروتوكول ب")).With(shared.Id);
        var owner = await OwnerAsync();

        var response = await owner.GetAsync($"{DrugsUrl}/{shared.Id}/protocols");

        await response.ShouldBeOkAsync();
        (await response.ReadAsync<List<string>>()).ShouldBe([aProtocol.Name]);
    }

    [Fact]
    [Trait("Case", "CAT-056")]
    public async Task No_subcategory_lists_only_the_categorys_drugs_without_one_own_and_admin_created_shared()
    {
        var (clinic, owner) = await EmptyClinicAsync();
        var own = await Data.Drug(clinic).InCategory(CategoryIds.Eye);
        await Data.Drug(clinic);
        var shared = await Data.SharedDrug().InCategory(CategoryIds.Eye);
        await Data.SharedDrug().InCategory(CategoryIds.Eye).Withdrawn();
        await Data.SharedDrug().InCategory(CategoryIds.Other);

        var page = await ListDrugsAsync(owner, $"categoryId={CategoryIds.Eye}&subCategoryId=none&pageSize=100");

        page.Items.Select(d => d.Id).ShouldBe([own.Id, shared.Id], "own first; no imported drug lacks a subcategory");
        page.TotalCount.ShouldBe(2);
        page.Items.ShouldAllBe(d => d.SubCategory == null && d.Category.Id == CategoryIds.Eye);
    }

    private Task<DateTime> UpdatedAtAsync(int drugId) =>
        App.QueryDbAsync(db => db.Drugs.IgnoreQueryFilters().Where(d => d.Id == drugId).Select(d => d.UpdatedAt).SingleAsync());
}
