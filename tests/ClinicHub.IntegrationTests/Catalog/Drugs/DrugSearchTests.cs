using ClinicHub.IntegrationTests.Harness.Assertions;
using ClinicHub.IntegrationTests.Harness.Builders;
using ClinicHub.IntegrationTests.Harness.Hosting;
using Microsoft.EntityFrameworkCore;
using Shouldly;

namespace ClinicHub.IntegrationTests.Catalog.Drugs;

/// <summary>
/// The drug search: case-insensitive, Arabic-normalized contains with prefix ranking (drugs § البحث عن دواء; drugs
/// tech § Backend; overview § Conventions "Search"). Each test has an empty clinic, so the results are exact.
/// </summary>
[Collection(CatalogListCollection.Name)]
[Trait("Area", "catalog")]
public class DrugSearchTests(AppFixture app) : CatalogTest(app)
{
    [Theory]
    [Trait("Tier", "Smoke")]
    [Trait("Case", "DRUG-037")]
    [InlineData("tobra")]
    [InlineData("TOBRA")]
    [InlineData("Dex")]
    public async Task The_search_is_a_case_insensitive_contains(string search)
    {
        var (clinic, owner) = await EmptyClinicAsync();
        await Data.Drug(clinic).Named("Tobradex");
        await Data.Drug(clinic).Named("Zinc");

        (await SearchDrugNamesAsync(owner, search)).ShouldBe(["Tobradex"]);
    }

    [Fact]
    [Trait("Case", "DRUG-038")]
    public async Task An_Arabic_word_in_the_middle_of_the_name_is_found()
    {
        var (clinic, owner) = await EmptyClinicAsync();
        await Data.Drug(clinic).Named("قطرة مرطبة");
        await Data.Drug(clinic).Named("قطرة أحمر");

        (await SearchDrugNamesAsync(owner, "مرطبة")).ShouldBe(["قطرة مرطبة"]);
    }

    [Fact]
    [Trait("Case", "DRUG-039")]
    public async Task An_alef_without_hamza_finds_the_name_written_with_it()
    {
        var (clinic, owner) = await EmptyClinicAsync();
        await Data.Drug(clinic).Named("قطرة أحمر");
        await Data.Drug(clinic).Named("قطرة مرطبة");

        (await SearchDrugNamesAsync(owner, "احمر")).ShouldBe(["قطرة أحمر"]);
    }

    [Fact]
    [Trait("Case", "DRUG-040")]
    public async Task Names_starting_with_the_term_come_first_then_the_others_by_name()
    {
        var (clinic, owner) = await EmptyClinicAsync();
        await Data.Drug(clinic).Named("Zinc tobra");
        await Data.Drug(clinic).Named("Atropine tobra");
        await Data.Drug(clinic).Named("Tobradex");

        (await SearchDrugNamesAsync(owner, "tobra")).ShouldBe(["Tobradex", "Atropine tobra", "Zinc tobra"]);
    }

    [Fact]
    [Trait("Case", "DRUG-041")]
    public async Task The_term_is_trimmed()
    {
        var (clinic, owner) = await EmptyClinicAsync();
        await Data.Drug(clinic).Named("Zinc tobra");
        await Data.Drug(clinic).Named("Tobradex");
        await Data.Drug(clinic).Named("Zinc");

        var trimmed = await SearchDrugNamesAsync(owner, "tobra");
        var padded = await SearchDrugNamesAsync(owner, "  tobra  ");

        padded.ShouldBe(trimmed);
        padded.ShouldBe(["Tobradex", "Zinc tobra"]);
    }

    [Theory]
    [Trait("Case", "DRUG-042")]
    [InlineData("tob\0ra")]
    [InlineData("\0tobra")]
    [InlineData("tob\tra")]
    [InlineData("tobra\u0001")]
    public async Task Control_characters_in_the_term_are_ignored(string search)
    {
        var (clinic, owner) = await EmptyClinicAsync();
        await Data.Drug(clinic).Named("Tobradex");
        await Data.Drug(clinic).Named("Zinc");

        (await SearchDrugNamesAsync(owner, search)).ShouldBe(["Tobradex"]);
    }

    [Fact]
    [Trait("Case", "DRUG-043")]
    public async Task Percent_and_underscore_only_match_themselves()
    {
        var (clinic, owner) = await EmptyClinicAsync();
        await Data.Drug(clinic).Named("Moxifloxacin 0.5%");
        await Data.Drug(clinic).Named("Moxifloxacin 0.5");
        await Data.Drug(clinic).Named("Vit_D");
        await Data.Drug(clinic).Named("VitXD");

        (await SearchDrugNamesAsync(owner, "%")).ShouldBe(["Moxifloxacin 0.5%"]);
        (await SearchDrugNamesAsync(owner, "0.5%")).ShouldBe(["Moxifloxacin 0.5%"]);
        (await SearchDrugNamesAsync(owner, "_")).ShouldBe(["Vit_D"]);
        (await SearchDrugNamesAsync(owner, "vit_")).ShouldBe(["Vit_D"]);
    }

    [Fact]
    [Trait("Case", "DRUG-044")]
    public async Task A_search_without_a_match_is_an_empty_page()
    {
        var (clinic, owner) = await EmptyClinicAsync();
        await Data.Drug(clinic).Named("Tobradex");

        var page = await ListDrugsAsync(owner, "search=nothing-like-it");

        page.Items.ShouldBeEmpty();
        page.TotalCount.ShouldBe(0);
    }

    [Theory]
    [Trait("Case", "DRUG-088")]
    [InlineData("اسبرين")]
    [InlineData("إسبرين")]
    [InlineData("آسبرين")]
    [InlineData("ٱسبرين")]
    public async Task Every_alef_form_finds_a_name_written_with_hamza(string search)
    {
        var (clinic, owner) = await EmptyClinicAsync();
        await Data.Drug(clinic).Named("أسبرين ممتد");
        await Data.Drug(clinic).Named("قطرة مرطبة");

        (await SearchDrugNamesAsync(owner, search)).ShouldBe(["أسبرين ممتد"]);
    }

    [Theory]
    [Trait("Case", "DRUG-089")]
    [InlineData("أسبرين")]
    [InlineData("إسبرين")]
    public async Task A_hamza_term_finds_a_name_stored_without_it(string search)
    {
        var (clinic, owner) = await EmptyClinicAsync();
        await Data.Drug(clinic).Named("اسبرين أطفال");
        await Data.Drug(clinic).Named("قطرة مرطبة");

        (await SearchDrugNamesAsync(owner, search)).ShouldBe(["اسبرين أطفال"]);
    }

    [Fact]
    [Trait("Case", "DRUG-090")]
    public async Task Alef_maksura_and_yeh_find_each_other()
    {
        var (clinic, owner) = await EmptyClinicAsync();
        await Data.Drug(clinic).Named("مستشفى العين");
        await Data.Drug(clinic).Named("قطرة عيني");

        (await SearchDrugNamesAsync(owner, "مستشفي")).ShouldBe(["مستشفى العين"]);
        (await SearchDrugNamesAsync(owner, "عينى")).ShouldBe(["قطرة عيني"]);
    }

    [Fact]
    [Trait("Case", "DRUG-091")]
    public async Task Teh_marbuta_and_heh_find_each_other()
    {
        var (clinic, owner) = await EmptyClinicAsync();
        await Data.Drug(clinic).Named("قطرة عيني");
        await Data.Drug(clinic).Named("قطره مرطبه");

        (await SearchDrugNamesAsync(owner, "قطره عيني")).ShouldBe(["قطرة عيني"]);
        (await SearchDrugNamesAsync(owner, "قطرة مرطبة")).ShouldBe(["قطره مرطبه"]);
    }

    [Fact]
    [Trait("Case", "DRUG-092")]
    public async Task Hamza_seats_fold_to_waw_and_yeh()
    {
        var (clinic, owner) = await EmptyClinicAsync();
        await Data.Drug(clinic).Named("مؤقت");
        await Data.Drug(clinic).Named("هيئة");

        (await SearchDrugNamesAsync(owner, "موقت")).ShouldBe(["مؤقت"]);
        (await SearchDrugNamesAsync(owner, "هييه")).ShouldBe(["هيئة"]);
    }

    [Theory]
    [Trait("Case", "DRUG-093")]
    [InlineData("مضاد حيوي")]
    [InlineData("مُضَادّ")]
    public async Task Diacritics_are_ignored_on_either_side(string search)
    {
        var (clinic, owner) = await EmptyClinicAsync();
        await Data.Drug(clinic).Named("مُضَادّ حَيَوِيّ");
        await Data.Drug(clinic).Named("مضاد حيوي قوي");
        await Data.Drug(clinic).Named("قطرة مرطبة");

        (await SearchDrugNamesAsync(owner, search)).ShouldBe(["مُضَادّ حَيَوِيّ", "مضاد حيوي قوي"], ignoreOrder: true);
    }

    [Fact]
    [Trait("Case", "DRUG-094")]
    public async Task Tatweel_is_ignored_on_either_side()
    {
        var (clinic, owner) = await EmptyClinicAsync();
        await Data.Drug(clinic).Named("كـــورتيزون");
        await Data.Drug(clinic).Named("كورتيزون موضعي");

        (await SearchDrugNamesAsync(owner, "كورتيزون")).ShouldBe(["كـــورتيزون", "كورتيزون موضعي"], ignoreOrder: true);
        (await SearchDrugNamesAsync(owner, "كـورتيزون م")).ShouldBe(["كورتيزون موضعي"]);
    }

    [Fact]
    [Trait("Case", "DRUG-095")]
    public async Task A_superscript_alef_reads_as_an_alef()
    {
        var (clinic, owner) = await EmptyClinicAsync();
        await Data.Drug(clinic).Named("هٰذا");
        await Data.Drug(clinic).Named("هذا");

        (await SearchDrugNamesAsync(owner, "هاذا")).ShouldBe(["هٰذا"]);
    }

    [Theory]
    [Trait("Case", "DRUG-096")]
    [InlineData("ـ")]
    [InlineData("ـــ")]
    [InlineData("َ")]
    [InlineData(" ّ ")]
    public async Task A_term_of_only_tatweel_or_diacritics_does_not_filter(string search)
    {
        var (clinic, owner) = await EmptyClinicAsync();
        await Data.Drug(clinic).Named("Tobradex");
        await Data.Drug(clinic).Named("قطرة مرطبة");
        await Data.Drug(clinic).Named("Zinc");

        var all = await ListDrugsAsync(owner);
        var searched = await ListDrugsAsync(owner, $"search={Uri.EscapeDataString(search)}");

        searched.TotalCount.ShouldBe(3);
        searched.Items.Select(d => d.Id).ShouldBe(all.Items.Select(d => d.Id));
    }

    [Fact]
    [Trait("Case", "DRUG-097")]
    public async Task Folded_prefix_matches_come_first_and_paging_counts_the_matches()
    {
        var (clinic, owner) = await EmptyClinicAsync();
        await Data.Drug(clinic).Named("قرص أسبرين");
        await Data.Drug(clinic).Named("اسبرين أطفال");
        await Data.Drug(clinic).Named("أسبرين ممتد");
        await Data.Drug(clinic).Named("قطرة مرطبة");
        // "by name" = the database's collation (drugs tech § Edge cases)
        var startingByName = await ByDatabaseCollationAsync("أسبرين ممتد", "اسبرين أطفال");

        var secondPageQuery = $"search={Uri.EscapeDataString("إسبرين")}&pageSize=2&page=2";

        // The catalog's data as given
        (await SearchDrugNamesAsync(owner, "إسبرين")).ShouldBe([.. startingByName, "قرص أسبرين"]);
        var secondPage = await ListDrugsAsync(owner, secondPageQuery);
        secondPage.Items.Select(d => d.Name).ShouldBe(["قرص أسبرين"]);
        secondPage.TotalCount.ShouldBe(3);

        // A match that sorts before every other name (Latin before Arabic, DRUG-036) but does not start with the term:
        // only the folded-prefix ranking keeps it after the two prefix matches
        await Data.Drug(clinic).Named("A أسبرين");
        (await SearchDrugNamesAsync(owner, "إسبرين")).ShouldBe([.. startingByName, "A أسبرين", "قرص أسبرين"]);
        secondPage = await ListDrugsAsync(owner, secondPageQuery);
        secondPage.Items.Select(d => d.Name).ShouldBe(["A أسبرين", "قرص أسبرين"]);
        secondPage.TotalCount.ShouldBe(4);
    }

    [Fact]
    [Trait("Case", "DRUG-098")]
    public async Task A_found_name_is_answered_as_stored()
    {
        var (clinic, owner) = await EmptyClinicAsync();
        var drug = await Data.Drug(clinic).Named("أسبرين ممتد");

        var page = await ListDrugsAsync(owner, $"search={Uri.EscapeDataString("اسبرين")}");

        var found = page.Items.ShouldHaveSingleItem();
        found.Id.ShouldBe(drug.Id);
        found.Name.ShouldBe("أسبرين ممتد");
    }

    [Fact]
    [Trait("Case", "DRUG-099")]
    public async Task Latin_names_are_unchanged_by_the_folding()
    {
        var (clinic, owner) = await EmptyClinicAsync();
        await Data.Drug(clinic).Named("Moxifloxacin 0.5%");
        await Data.Drug(clinic).Named("Moxifloxacin 05");
        await Data.Drug(clinic).Named("قطرة Tobradex");
        await Data.Drug(clinic).Named("Tobradex");

        (await SearchDrugNamesAsync(owner, "MOXI")).ShouldBe(["Moxifloxacin 0.5%", "Moxifloxacin 05"], ignoreOrder: true);
        (await SearchDrugNamesAsync(owner, "%")).ShouldBe(["Moxifloxacin 0.5%"]);
        (await SearchDrugNamesAsync(owner, "قطره TOBRA")).ShouldBe(["قطرة Tobradex"]);
    }

    [Fact]
    [Trait("Case", "DRUG-100")]
    public async Task A_rename_is_searchable_at_once()
    {
        var (clinic, owner) = await EmptyClinicAsync();
        var drug = await Data.Drug(clinic).Named("مؤقت");
        (await SearchDrugNamesAsync(owner, "موقته")).ShouldBeEmpty();

        await (await PutDrugAsync(owner, drug.Id, "مُؤقّتة")).ShouldBeOkAsync();

        (await SearchDrugNamesAsync(owner, "موقته")).ShouldBe(["مُؤقّتة"]);
        (await SearchDrugNamesAsync(owner, "مؤقت")).ShouldBe(["مُؤقّتة"]);
    }

    /// <summary>The names sorted by the database's default collation (the oracle for "by name").</summary>
    private Task<List<string>> ByDatabaseCollationAsync(params string[] names) =>
        App.QueryDbAsync(db => db.Database
            .SqlQuery<string>($"SELECT n AS \"Value\" FROM unnest({names}) AS n ORDER BY n")
            .ToListAsync());
}
