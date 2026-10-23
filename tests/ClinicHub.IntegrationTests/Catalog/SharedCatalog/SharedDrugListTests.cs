using System.Net;
using ClinicHub.Application.Features.Catalog.Categories;
using ClinicHub.IntegrationTests.Harness.Assertions;
using ClinicHub.IntegrationTests.Harness.Builders;
using ClinicHub.IntegrationTests.Harness.Hosting;
using Microsoft.EntityFrameworkCore;
using Shouldly;

namespace ClinicHub.IntegrationTests.Catalog.SharedCatalog;

/// <summary>
/// The clinic drug list with the shared catalog (design M1.7 D1, D7, D8; § 8): both kinds listed, <c>source</c>, the
/// order (own drugs first), paging over the full catalog and the category filters. No test of this class creates an
/// active shared drug or a category, so the imported counts hold (the run's baseline, D12).
/// </summary>
[Collection(CatalogSharedCollection.Name)]
[Trait("Area", "catalog")]
public class SharedDrugListTests(AppFixture app) : CatalogTest(app)
{
    private static readonly string Glaucoma = $"categoryId={CategoryIds.Eye}&subCategoryId={SubCategoryIds.Glaucoma}";

    [Fact]
    [Trait("Tier", "Smoke")]
    [Trait("Case", "CAT-008")]
    public async Task A_clinic_lists_the_active_shared_drugs_and_its_own_and_each_item_says_which_it_is()
    {
        var (clinic, owner) = await EmptyClinicAsync();
        var own = new[] { (await Data.Drug(clinic)).Id, (await Data.Drug(clinic)).Id, (await Data.Drug(clinic)).Id };

        var page = await ListDrugsAsync(owner, "pageSize=100");

        page.TotalCount.ShouldBe(BaselineSharedCount + 3);
        page.Items.Count.ShouldBe(100);
        page.Items.Where(d => !d.IsShared).Select(d => d.Id).ShouldBe(own, ignoreOrder: true);
        page.Items.Count(d => d.IsShared).ShouldBe(97);
        foreach (var drug in page.Items.Where(d => d.IsShared))
        {
            drug.DefaultDosing.ShouldBeNull($"{drug.Name}: a shared drug has no default dosing");
            drug.Withdrawn.ShouldBeFalse(drug.Name);
            drug.Category.ShouldNotBeNull(drug.Name);
        }
    }

    [Fact]
    [Trait("Tier", "Smoke")]
    [Trait("Case", "CAT-009")]
    public async Task Two_clinics_see_the_same_shared_drugs_and_never_each_others_own()
    {
        // Without the template's copied drugs: the own lists below are exactly what this test adds
        var (a, ownerA) = await EmptyClinicAsync();
        var (b, ownerB) = await EmptyClinicAsync();
        var aDrug = await Data.Drug(a).Named(Unique.Name("Zqa own drug", "خاص أ"));
        var bDrug = await Data.Drug(b).Named(Unique.Name("Zqb own drug", "خاص ب"));
        var vigamox = await Data.Shared(ImportedDrugs.Vigamox);

        var sharedA = await ListDrugsAsync(ownerA, "source=shared&pageSize=100");
        var sharedB = await ListDrugsAsync(ownerB, "source=shared&pageSize=100");
        sharedA.TotalCount.ShouldBe(BaselineSharedCount);
        sharedB.TotalCount.ShouldBe(BaselineSharedCount);
        sharedA.Items.Select(d => d.Id).ShouldBe(sharedB.Items.Select(d => d.Id));
        (await GetDrugAsync(ownerA, vigamox.Id)).Name.ShouldBe(ImportedDrugs.Vigamox);
        (await GetDrugAsync(ownerB, vigamox.Id)).Name.ShouldBe(ImportedDrugs.Vigamox);
        (await SearchDrugNamesAsync(ownerA, ImportedDrugs.Vigamox)).ShouldContain(ImportedDrugs.Vigamox);
        (await SearchDrugNamesAsync(ownerB, ImportedDrugs.Vigamox)).ShouldContain(ImportedDrugs.Vigamox);

        foreach (var source in new[] { "all", "shared", "own" })
        {
            var listA = await ListDrugsAsync(ownerA, $"source={source}&pageSize=100");
            var listB = await ListDrugsAsync(ownerB, $"source={source}&pageSize=100");
            listA.Items.ShouldNotContain(d => d.Id == bDrug.Id, $"A, source={source}");
            listB.Items.ShouldNotContain(d => d.Id == aDrug.Id, $"B, source={source}");
            (await ListDrugsAsync(ownerA, $"source={source}&search={Uri.EscapeDataString(bDrug.Name)}")).TotalCount
                .ShouldBe(0, $"A searching B's own drug, source={source}");
            (await ListDrugsAsync(ownerB, $"source={source}&search={Uri.EscapeDataString(aDrug.Name)}")).TotalCount
                .ShouldBe(0, $"B searching A's own drug, source={source}");
        }
        (await ListOwnDrugsAsync(ownerA)).Items.Select(d => d.Id).ShouldBe([aDrug.Id]);
        (await ListOwnDrugsAsync(ownerB)).Items.Select(d => d.Id).ShouldBe([bDrug.Id]);
        (await SearchDrugNamesAsync(ownerA, aDrug.Name)).ShouldBe([aDrug.Name]);
    }

    [Fact]
    [Trait("Case", "CAT-010")]
    public async Task An_own_drug_named_like_a_shared_one_is_listed_with_it_first_and_marked_own()
    {
        var (clinic, owner) = await EmptyClinicAsync();
        var mine = await Data.Drug(clinic).Named(ImportedDrugs.Alemox1Gm);
        var shared = await Data.Shared(ImportedDrugs.Alemox1Gm);

        var page = await ListDrugsAsync(owner, $"search={Uri.EscapeDataString("alemox 1 gm")}&pageSize=100");

        page.Items[0].Id.ShouldBe(mine.Id);
        page.Items[0].IsShared.ShouldBeFalse();
        page.Items[0].Name.ShouldBe(ImportedDrugs.Alemox1Gm);
        var listedShared = page.Items.Where(d => d.Id == shared.Id).ShouldHaveSingleItem();
        listedShared.IsShared.ShouldBeTrue();
        listedShared.Name.ShouldBe(ImportedDrugs.Alemox1Gm);
    }

    [Fact]
    [Trait("Tier", "Smoke")]
    [Trait("Case", "CAT-011")]
    public async Task Source_shared_lists_only_the_active_shared_drugs_own_only_the_clinics_and_no_source_means_all()
    {
        var (clinic, owner) = await EmptyClinicAsync();
        var own = new[] { (await Data.Drug(clinic)).Id, (await Data.Drug(clinic)).Id };
        var withdrawn = await Data.SharedDrug().Withdrawn();

        var shared = await ListDrugsAsync(owner, "source=shared&pageSize=100");
        shared.TotalCount.ShouldBe(BaselineSharedCount, "the active shared drugs: the withdrawn one excluded");
        shared.Items.ShouldAllBe(d => d.IsShared);
        shared.Items.ShouldNotContain(d => d.Id == withdrawn.Id);
        (await ListDrugsAsync(owner, $"source=shared&search={Uri.EscapeDataString(withdrawn.Name)}")).TotalCount.ShouldBe(0);

        var mine = await ListOwnDrugsAsync(owner, "pageSize=100");
        mine.TotalCount.ShouldBe(2);
        mine.Items.Select(d => d.Id).ShouldBe(own, ignoreOrder: true);
        mine.Items.ShouldAllBe(d => !d.IsShared);

        var all = await ListDrugsAsync(owner, "source=all&pageSize=100");
        var noSource = await ListDrugsAsync(owner, "pageSize=100");
        all.TotalCount.ShouldBe(BaselineSharedCount + 2);
        noSource.TotalCount.ShouldBe(all.TotalCount);
        noSource.Items.Select(d => d.Id).ShouldBe(all.Items.Select(d => d.Id));
    }

    [Theory]
    [Trait("Case", "CAT-012")]
    [InlineData("Shared")]
    [InlineData("mine")]
    [InlineData("1")]
    [InlineData("%00")]
    [InlineData("ALL")]
    [InlineData("own%20")]
    public async Task A_source_other_than_the_exact_lower_case_values_is_400_invalidRequest_on_source(string source)
    {
        var owner = await OwnerAsync();

        var problem = await (await owner.GetAsync($"{DrugsUrl}?source={source}"))
            .ShouldBeProblemAsync(HttpStatusCode.BadRequest, "invalidRequest");

        problem.ShouldHaveError("source", "invalidRequest");
    }

    [Fact]
    [Trait("Case", "CAT-012")]
    public async Task An_empty_source_means_all()
    {
        var owner = await OwnerAsync();

        var empty = await ListDrugsAsync(owner, "source=&pageSize=100");
        var all = await ListDrugsAsync(owner, "source=all&pageSize=100");

        empty.TotalCount.ShouldBe(all.TotalCount);
        empty.Items.Select(d => d.Id).ShouldBe(all.Items.Select(d => d.Id));
        empty.Items.ShouldContain(d => d.IsShared);
    }

    [Fact]
    [Trait("Case", "CAT-014")]
    public async Task The_super_admin_in_the_template_lists_the_templates_own_drugs_and_every_active_shared_drug()
    {
        var templateId = await App.TemplateClinicIdAsync();
        var first = await Data.Drug(templateId);
        var second = await Data.Drug(templateId);
        var templateOwn = await App.QueryDbAsync(db => db.Drugs.IgnoreQueryFilters().CountAsync(d => d.ClinicId == templateId));
        var admin = await Login.SuperAdminInTemplateAsync();

        var page = await ListDrugsAsync(admin, "pageSize=100");

        page.TotalCount.ShouldBe(templateOwn + BaselineSharedCount);
        page.Items.Where(d => !d.IsShared).Select(d => d.Id).ShouldContain(first.Id);
        page.Items.Where(d => !d.IsShared).Select(d => d.Id).ShouldContain(second.Id);
        page.Items.ShouldContain(d => d.IsShared);
        (await ListOwnDrugsAsync(admin, "pageSize=100")).TotalCount.ShouldBe(templateOwn);
        (await ListDrugsAsync(admin, "source=shared")).TotalCount.ShouldBe(BaselineSharedCount);
    }

    [Fact]
    [Trait("Case", "CAT-015")]
    public async Task Without_a_search_own_drugs_come_newest_first_then_the_shared_ones_by_name()
    {
        var (clinic, owner) = await EmptyClinicAsync();
        await Data.Drug(clinic).Named("Zinc");
        Clock.Advance(TimeSpan.FromMinutes(1));
        await Data.Drug(clinic).Named("atropine");
        Clock.Advance(TimeSpan.FromMinutes(1));
        await Data.Drug(clinic).Named("قطرة مرطبة");

        var names = (await ListDrugsAsync(owner, "pageSize=20")).Items.Select(d => d.Name).ToList();

        names.Take(3).ShouldBe(["قطرة مرطبة", "atropine", "Zinc"]);
        var shared = names.Skip(3).ToList();
        shared[0].ShouldBe(ImportedDrugs.FirstByName);
        shared.Take(11).ShouldAllBe(name => char.IsAsciiDigit(name[0]));
        char.IsAsciiDigit(shared[11][0]).ShouldBeFalse($"the 12th shared name, {shared[11]}: only 11 start with a digit");
        shared.Take(11).ShouldContain("2HC F.C.T 20 TABLETS");
        shared.ShouldBe(await InDatabaseCollationAsync(shared), "the shared drugs by name (database collation)");
    }

    [Fact]
    [Trait("Case", "CAT-017")]
    public async Task In_a_subcategory_the_clinics_own_drugs_come_first_then_the_shared_ones_with_and_without_a_search()
    {
        var (clinic, owner) = await EmptyClinicAsync();
        var startsWith = await Data.Drug(clinic).Named(Unique.Name("Glaucoma own drug", "خاص"));
        var contains = await Data.Drug(clinic).Named(Unique.Name("Zx own drug", "خاص"));

        var noSearch = await AllPagesAsync(owner, Glaucoma);
        var searched = await AllPagesAsync(owner, $"{Glaucoma}&search=glaucoma");

        // No search: own drugs newest first, then the shared ones by name
        noSearch.Take(2).Select(d => d.Id).ShouldBe([contains.Id, startsWith.Id]);
        noSearch.Skip(2).ShouldAllBe(d => d.IsShared);
        noSearch.Skip(2).Count().ShouldBe(91);
        var sharedNames = noSearch.Skip(2).Select(d => d.Name).ToList();
        sharedNames.ShouldBe(await InDatabaseCollationAsync(sharedNames));
        // "glaucoma" matches all of them (the subcategory's name): own first, the one starting with the term first
        searched.Take(2).Select(d => d.Id).ShouldBe([startsWith.Id, contains.Id]);
        searched.Skip(2).Select(d => d.Name).ShouldBe(sharedNames);
    }

    [Fact]
    [Trait("Case", "CAT-018")]
    public async Task The_last_page_of_100_holds_the_last_17_and_past_it_the_pages_are_empty()
    {
        var (clinic, owner) = await EmptyClinicAsync();
        for (var i = 0; i < 3; i++)
            await Data.Drug(clinic);
        var total = BaselineSharedCount + 3;
        var lastPage = (total + 99) / 100;
        var lastPageShared = await App.QueryDbAsync(db => db.Database.SqlQuery<int>(
                $"""SELECT "Id" AS "Value" FROM "Drugs" WHERE "ClinicId" IS NULL AND NOT "IsWithdrawn" ORDER BY "Name", "Id" OFFSET {(lastPage - 1) * 100 - 3}""")
            .ToListAsync());

        var last = await ListDrugsAsync(owner, $"pageSize=100&page={lastPage}");

        lastPage.ShouldBe(235, "23,414 shared + 3 own = 23,417 drugs");
        last.TotalCount.ShouldBe(total);
        last.Items.Count.ShouldBe(17);
        last.Items.Select(d => d.Id).ShouldBe(lastPageShared);
        foreach (var page in new[] { lastPage + 1, int.MaxValue })
        {
            var past = await ListDrugsAsync(owner, $"pageSize=100&page={page}");
            past.Items.ShouldBeEmpty($"page {page}");
            past.TotalCount.ShouldBe(total, $"page {page}");
        }
    }

    [Fact]
    [Trait("Tier", "Smoke")]
    [Trait("Case", "CAT-055")]
    public async Task A_category_filter_lists_only_its_shared_and_own_drugs_and_counts_them()
    {
        var (clinic, owner) = await EmptyClinicAsync();
        var inEye = await Data.Drug(clinic);
        var inEyeNoSub = await Data.Drug(clinic).InCategory(CategoryIds.Eye);
        var elsewhere = await Data.Drug(clinic).InCategory(CategoryIds.Other);

        var eye = await AllPagesAsync(owner, $"categoryId={CategoryIds.Eye}");

        eye.Count.ShouldBe(541 + 2, "«العيون»: 541 shared + A's 2 own there");
        (await ListDrugsAsync(owner, $"categoryId={CategoryIds.Eye}")).TotalCount.ShouldBe(543);
        eye.ShouldAllBe(d => d.Category.Id == CategoryIds.Eye);
        eye.Take(2).Select(d => d.Id).ShouldBe([inEyeNoSub.Id, inEye.Id]);
        eye.ShouldNotContain(d => d.Id == elsewhere.Id);
        eye.Count(d => d.IsShared).ShouldBe(541);
    }

    [Theory]
    [Trait("Case", "CAT-057")]
    [InlineData("subCategoryId=5")]
    [InlineData("subCategoryId=none")]
    [InlineData("subCategoryId=138&source=own")]
    public async Task A_subcategory_without_a_category_is_400_invalidRequest_on_subCategoryId(string query)
    {
        var owner = await OwnerAsync();

        var problem = await (await owner.GetAsync($"{DrugsUrl}?{query}")).ShouldBeProblemAsync(HttpStatusCode.BadRequest, "invalidRequest");

        problem.ShouldHaveError("subCategoryId", "invalidRequest");
    }

    [Theory]
    [Trait("Case", "CAT-058")]
    [InlineData("categoryId=17&subCategoryId=182")]
    [InlineData("categoryId=23&subCategoryId=138")]
    [InlineData("categoryId=2147483000")]
    [InlineData("categoryId=2147483000&subCategoryId=none")]
    [InlineData("categoryId=17&subCategoryId=2147483000")]
    public async Task A_subcategory_of_another_category_or_unknown_ids_answer_an_empty_page(string query)
    {
        var (clinic, owner) = await EmptyClinicAsync();
        await Data.Drug(clinic);
        await Data.Drug(clinic).InCategory(CategoryIds.Other, SubCategoryIds.Unclassified);

        var page = await ListDrugsAsync(owner, query);

        page.Items.ShouldBeEmpty();
        page.TotalCount.ShouldBe(0);
    }

    [Theory]
    [Trait("Case", "CAT-059")]
    [InlineData("categoryId=17&subCategoryId=abc", "subCategoryId")]
    [InlineData("categoryId=17&subCategoryId=NONE", "subCategoryId")]
    [InlineData("categoryId=17&subCategoryId=None", "subCategoryId")]
    [InlineData("categoryId=17&subCategoryId=0", "subCategoryId")]
    [InlineData("categoryId=17&subCategoryId=-1", "subCategoryId")]
    [InlineData("categoryId=17&subCategoryId=%2B5", "subCategoryId")]
    [InlineData("categoryId=1.5", null)]
    [InlineData("categoryId=2147483648", null)]
    public async Task A_malformed_category_or_subcategory_is_400_invalidRequest(string query, string field)
    {
        var owner = await OwnerAsync();

        var problem = await (await owner.GetAsync($"{DrugsUrl}?{query}")).ShouldBeProblemAsync(HttpStatusCode.BadRequest, "invalidRequest");

        if (field is not null)
            problem.ShouldHaveError(field, "invalidRequest");
    }

    [Fact]
    [Trait("Case", "CAT-060")]
    public async Task Filters_search_source_and_page_intersect_and_the_total_is_the_filtered_one()
    {
        var (clinic, owner) = await EmptyClinicAsync();
        var term = $"zqk{Unique.Next()}";
        foreach (var letter in new[] { "e", "c", "a", "d", "b" })
            await Data.Drug(clinic).Named($"{term} {letter}");
        await Data.Drug(clinic).Named($"{term} other category").InCategory(CategoryIds.Other);
        await Data.Drug(clinic).Named($"{term} no subcategory").InCategory(CategoryIds.Eye);
        await Data.Drug(clinic).Named(Unique.Name("Without the term", "بدون"));

        var page = await ListDrugsAsync(owner, $"source=own&{Glaucoma}&search={term}&page=2&pageSize=2");

        page.TotalCount.ShouldBe(5);
        page.Items.Select(d => d.Name).ShouldBe([$"{term} c", $"{term} d"]);
        page.Page.ShouldBe(2);
        (await ListDrugsAsync(owner, $"source=own&categoryId={CategoryIds.Eye}&subCategoryId=none&search={term}"))
            .Items.Select(d => d.Name).ShouldBe([$"{term} no subcategory"]);
    }
}
