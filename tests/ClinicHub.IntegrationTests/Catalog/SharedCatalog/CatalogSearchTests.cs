using ClinicHub.Application.Features.Catalog.Drugs;
using ClinicHub.IntegrationTests.Harness.Builders;
using ClinicHub.IntegrationTests.Harness.Clients;
using ClinicHub.IntegrationTests.Harness.Hosting;
using Shouldly;

namespace ClinicHub.IntegrationTests.Catalog.SharedCatalog;

/// <summary>
/// Searching the drug list with the shared catalog (design M1.7 D7): the folded term contained in the name, the hidden
/// Arabic name, the active ingredients or the category and subcategory names; own drugs first, then shared; inside each
/// part the names starting with the term first, then by name. The catalog's numbers are asserted here, at the api level
/// (D12). No test of this class writes the shared catalog or the categories.
/// </summary>
[Collection(CatalogSearchCollection.Name)]
[Trait("Area", "catalog")]
public class CatalogSearchTests(AppFixture app) : CatalogTest(app)
{
    [Fact]
    [Trait("Tier", "Smoke")]
    [Trait("Case", "CAT-061")]
    public async Task An_ingredient_finds_the_203_shared_drugs_holding_it_all_penicillins_and_the_own_drugs_holding_it()
    {
        var (clinic, owner) = await EmptyClinicAsync();
        var own = await Data.Drug(clinic).Named(Unique.Name("Zq capsules", "كبسول")).WithIngredients("Amoxicillin");

        var shared = await AllPagesAsync(owner, "source=shared&search=amoxicillin");
        var all = await ListDrugsAsync(owner, "search=amoxicillin&pageSize=100");

        shared.Count.ShouldBe(203);
        shared.ShouldAllBe(d => d.SubCategory != null && d.SubCategory.NameAr == ImportedDrugs.PenicillinsAr);
        shared.ShouldAllBe(d => d.Category.NameAr == ImportedDrugs.AntiInfectivesAr);
        shared.Select(d => d.Name).ShouldContain(ImportedDrugs.Alemox1Gm);
        all.TotalCount.ShouldBe(204);
        all.Items[0].Id.ShouldBe(own.Id);
    }

    [Theory]
    [Trait("Case", "CAT-063")]
    [InlineData("اليموكس")]
    [InlineData("أليموكس")]
    [InlineData("إليموكس")]
    public async Task The_hidden_Arabic_name_is_folded_like_names_so_an_alef_without_hamza_finds_it(string search)
    {
        var (_, owner) = await EmptyClinicAsync();

        var names = await SearchDrugNamesAsync(owner, search);

        names.ShouldBe([ImportedDrugs.Alemox1Gm, ImportedDrugs.Alemox750Mg]);
    }

    [Fact]
    [Trait("Tier", "Smoke")]
    [Trait("Case", "CAT-064")]
    public async Task Own_drugs_come_first_the_one_starting_with_the_term_first_then_the_shared_ones()
    {
        var (clinic, owner) = await EmptyClinicAsync();
        await Data.Drug(clinic).Named("قطرة alemox");
        await Data.Drug(clinic).Named("Alemox drops");

        var names = await SearchDrugNamesAsync(owner, "alemox");

        names.ShouldBe(["Alemox drops", "قطرة alemox", ImportedDrugs.Alemox1Gm, ImportedDrugs.Alemox750Mg]);
    }

    [Fact]
    [Trait("Tier", "Smoke")]
    [Trait("Case", "CAT-065")]
    public async Task Tobra_lists_the_own_drug_then_the_9_shared_names_starting_with_it_then_the_25_others_by_name()
    {
        var (clinic, owner) = await EmptyClinicAsync();
        var mine = await Data.Drug(clinic).Named("Tobradex");

        var page = await ListDrugsAsync(owner, "search=tobra&pageSize=100");
        var names = page.Items.Select(d => d.Name).ToList();

        page.TotalCount.ShouldBe(35);
        page.Items[0].Id.ShouldBe(mine.Id);
        names.Skip(1).Take(9).ShouldBe([
            "TOBRA-ALEX 20MG/2ML 5 AMP.", "TOBRA-ALEX 80MG/2ML I.V./I.M. AMP.", "TOBRABIOTIC 0.3% EYE DROPS 10 ML",
            "TOBRABIOTIC PLUS EYE SUSP. DROPS 5 ML", "TOBRACOID EYE DROPS 5 ML", "TOBRACTIVA 0.3% EYE DROPS 5 ML",
            ImportedDrugs.TobradexOintment, ImportedDrugs.TobradexDrops, "TOBRAL 0.3% EYE DROPS 5 ML",
        ]);
        var others = names.Skip(10).ToList();
        others.Count.ShouldBe(25);
        others[0].ShouldBe("AVAZIR 0.3% EYE DROPS 10 ML");
        others[^1].ShouldBe("TOBRIN 0.3% EYE.OINT. 5 GM");
        others.ShouldContain("CO- AVAZIR EYE OINT. 5 GM");
        others.ShouldContain("SWIXTOBRAM 0.3% EYE DROPS 5 ML");
        others.ShouldBe(await InDatabaseCollationAsync(others), "the other 25 by name");
        page.Items.Skip(1).ShouldAllBe(d => d.IsShared);
    }

    [Fact]
    [Trait("Case", "CAT-066")]
    public async Task Moxi_finds_276_shared_drugs_in_7_categories_the_14_names_starting_with_it_first()
    {
        var (_, owner) = await EmptyClinicAsync();

        var found = await AllPagesAsync(owner, "source=shared&search=moxi");
        var names = found.Select(d => d.Name).ToList();

        found.Count.ShouldBe(276);
        found.Select(d => d.Category.Id).Distinct().Count().ShouldBe(7, "categories");
        found.Select(d => d.SubCategory?.Id).Distinct().Count().ShouldBe(10, "subcategories");
        names.Take(14).ShouldAllBe(n => n.StartsWith("MOXI", StringComparison.OrdinalIgnoreCase));
        names.Take(14).ShouldContain("MOXIFLOX 400 MG 10 F.C.TABS.");
        names.Take(14).ShouldBe(await InDatabaseCollationAsync(names.Take(14)));
        var rest = names.Skip(14).ToList();
        rest.ShouldAllBe(n => !n.StartsWith("MOXI", StringComparison.OrdinalIgnoreCase));
        rest[0].ShouldBe("ACTIMOXIFLOX 400 MG 10 F.C.TABS.");
        rest.ShouldContain(ImportedDrugs.Vigamox);
        rest.ShouldContain(ImportedDrugs.Alemox1Gm);
        rest.ShouldBe(await InDatabaseCollationAsync(rest), "the other 262 by name, whatever field holds the term");
    }

    [Theory]
    [Trait("Case", "CAT-067")]
    [InlineData("DEXAMETHASONE+TOBRAMYCIN", "DEXAMETHASONE TOBRAMYCIN", ImportedDrugs.TobradexDrops)]
    [InlineData("PARACETAMOL(ACETAMINOPHEN)", "PARACETAMOL ACETAMINOPHEN)", null)]
    public async Task A_term_copied_from_the_ingredients_finds_the_drugs_holding_it(string search, string held, string expected)
    {
        var (_, owner) = await EmptyClinicAsync();

        var found = await AllPagesAsync(owner, $"source=shared&search={Uri.EscapeDataString(search)}");

        found.ShouldNotBeEmpty();
        found.ShouldAllBe(d => d.ActiveIngredients != null
            && d.ActiveIngredients.ToUpperInvariant().Replace('+', ' ').Replace('(', ' ').Contains(held));
        if (expected is not null)
            found.Select(d => d.Name).ShouldContain(expected);
    }

    [Fact]
    [Trait("Case", "CAT-068")]
    public async Task Acetaminophen_finds_258_drugs_the_one_name_starting_with_it_first_then_by_name()
    {
        var (_, owner) = await EmptyClinicAsync();

        var found = await AllPagesAsync(owner, "source=shared&search=acetaminophen");
        var names = found.Select(d => d.Name).ToList();

        found.Count.ShouldBe(258);
        found.Select(d => d.Category.Id).Distinct().Count().ShouldBe(6, "categories");
        found.Select(d => d.SubCategory?.Id).Distinct().Count().ShouldBe(12, "subcategories");
        names[0].ShouldBe("ACETAMINOPHEN 125MG PAED. SUPP.U.S.P.XXIII");
        names[1].ShouldBe(ImportedDrugs.FirstByName);
        names.Skip(1).ShouldBe(await InDatabaseCollationAsync(names.Skip(1)));
    }

    [Fact]
    [Trait("Case", "CAT-069")]
    public async Task Percent_underscore_backslash_slash_and_dot_only_match_themselves()
    {
        var (clinic, owner) = await EmptyClinicAsync();
        var n = Unique.Next();
        await Data.Drug(clinic).Named($"Zq{n} 0.5% drops");
        await Data.Drug(clinic).Named($"Zq{n} 15 drops");
        await Data.Drug(clinic).Named($"Zq{n} A_B");
        await Data.Drug(clinic).Named($"Zq{n} AxB");
        await Data.Drug(clinic).Named($"Zq{n} A\\B");
        await Data.Drug(clinic).Named($"Zq{n} AB");

        (await SearchOwnDrugNamesAsync(owner, $"zq{n} 0.5%")).ShouldBe([$"Zq{n} 0.5% drops"]);
        (await SearchOwnDrugNamesAsync(owner, "5%")).ShouldBe([$"Zq{n} 0.5% drops"]);
        (await SearchOwnDrugNamesAsync(owner, "a_b")).ShouldBe([$"Zq{n} A_B"]);
        (await SearchOwnDrugNamesAsync(owner, "A\\B")).ShouldBe([$"Zq{n} A\\B"]);
        (await SearchOwnDrugNamesAsync(owner, "\\")).ShouldBe([$"Zq{n} A\\B"]);

        foreach (var term in new[] { "5%", "SOFFIONIL_CARE", "50MCG/ML", "F.C." })
        {
            var found = (await ListDrugsAsync(owner, $"source=shared&pageSize=100&search={Uri.EscapeDataString(term)}")).Items;
            found.ShouldNotBeEmpty(term);
            found.ShouldAllBe(d => d.Name.Contains(term, StringComparison.OrdinalIgnoreCase)
                || (d.ActiveIngredients != null && d.ActiveIngredients.Contains(term, StringComparison.OrdinalIgnoreCase)));
        }
        (await AllPagesAsync(owner, $"source=shared&search={Uri.EscapeDataString("50MCG/ML EYE DROPS")}")).Select(d => d.Name)
            .ShouldContain(ImportedDrugs.Xalatan);    }

    [Fact]
    [Trait("Tier", "Smoke")]
    [Trait("Case", "CAT-071")]
    public async Task A_drug_without_ingredients_is_found_by_its_hidden_Arabic_name_and_an_own_drug_by_its_ingredient()
    {
        var (clinic, owner) = await EmptyClinicAsync();
        var ingredient = $"zqxolol{Unique.Next()}";
        var own = await Data.Drug(clinic).Named(Unique.Name("Eye drops", "قطرة")).WithIngredients($"{ingredient.ToUpperInvariant()}+TIMOLOL");

        var nailner = (await ListDrugsAsync(owner, $"search={Uri.EscapeDataString("نايلنير")}")).Items;
        var byIngredient = (await ListDrugsAsync(owner, $"search={ingredient}")).Items;

        var found = nailner.Where(d => d.Name == ImportedDrugs.Nailner).ShouldHaveSingleItem();
        found.ActiveIngredients.ShouldBeNull();
        found.IsShared.ShouldBeTrue();
        var mine = byIngredient.ShouldHaveSingleItem();
        mine.Id.ShouldBe(own.Id);
        mine.ActiveIngredients.ShouldBe($"{ingredient.ToUpperInvariant()}+TIMOLOL");
    }

    [Fact]
    [Trait("Case", "CAT-072")]
    public async Task A_single_letter_matches_23410_of_the_shared_drugs_and_an_alef_all_of_them_and_paging_works()
    {
        var (_, owner) = await EmptyClinicAsync();

        var latin = await ListDrugsAsync(owner, "source=shared&search=a&pageSize=100");
        var alef = await ListDrugsAsync(owner, $"source=shared&search={Uri.EscapeDataString("ا")}&pageSize=100");
        var second = await ListDrugsAsync(owner, "source=shared&search=a&pageSize=100&page=2");
        var lastPage = (latin.TotalCount + 99) / 100;
        var last = await ListDrugsAsync(owner, $"source=shared&search=a&pageSize=100&page={lastPage}");

        latin.TotalCount.ShouldBe(23_410);
        alef.TotalCount.ShouldBe(BaselineSharedCount);
        alef.TotalCount.ShouldBe(23_414);
        latin.Items.Count.ShouldBe(100);
        second.Items.Count.ShouldBe(100);
        second.Items.Select(d => d.Id).Intersect(latin.Items.Select(d => d.Id)).ShouldBeEmpty("page 2 repeats page 1");
        last.Items.Count.ShouldBe(10);
        last.TotalCount.ShouldBe(23_410);
    }

    [Fact]
    [Trait("Case", "CAT-074")]
    public async Task Amox_finds_219_drugs_in_6_categories_with_their_counts_by_category_and_subcategory()
    {
        var (_, owner) = await EmptyClinicAsync();
        var categories = await CategoriesAsync(owner);
        int Category(string nameAr) => categories.Where(c => c.NameAr == nameAr).ShouldHaveSingleItem(nameAr).Id;
        var antiInfectives = categories.Where(c => c.NameAr == ImportedDrugs.AntiInfectivesAr).ShouldHaveSingleItem();
        int Sub(string nameAr) => antiInfectives.SubCategories.Where(s => s.NameAr == nameAr).ShouldHaveSingleItem(nameAr).Id;

        (await CountAsync(owner, "")).ShouldBe(219);
        var byCategory = new Dictionary<string, int>
        {
            [ImportedDrugs.AntiInfectivesAr] = 207, ["الأورام"] = 5, ["الأمراض الجلدية"] = 4,
            ["التخدير ومستلزمات المستشفيات"] = 1, [ImportedDrugs.EyeAr] = 1, ["الفيتامينات والمكملات الغذائية"] = 1,
        };
        foreach (var (name, count) in byCategory)
            (await CountAsync(owner, $"&categoryId={Category(name)}")).ShouldBe(count, name);
        byCategory.Values.Sum().ShouldBe(219);
        var bySubCategory = new Dictionary<string, int>
        {
            [ImportedDrugs.PenicillinsAr] = 203, ["الكينولونات"] = 2, ["طاردات الديدان"] = 1, ["مضادات الدرن"] = 1,
        };
        foreach (var (name, count) in bySubCategory)
            (await CountAsync(owner, $"&categoryId={antiInfectives.Id}&subCategoryId={Sub(name)}")).ShouldBe(count, name);
        (await CountAsync(owner, $"&categoryId={antiInfectives.Id}&subCategoryId=none")).ShouldBe(0);
    }

    /// <summary>The <c>totalCount</c> of the shared drugs matching "amox" with the extra filters.</summary>
    private static async Task<int> CountAsync(ApiClient owner, string filters) =>
        (await ListDrugsAsync(owner, $"source=shared&search=amox{filters}")).TotalCount;
}
