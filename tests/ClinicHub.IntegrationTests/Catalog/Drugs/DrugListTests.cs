using System.Text.Json.Nodes;
using ClinicHub.Application.Features.Catalog.Categories;
using ClinicHub.IntegrationTests.Harness.Assertions;
using ClinicHub.IntegrationTests.Harness.Builders;
using ClinicHub.IntegrationTests.Harness.Hosting;
using Shouldly;

namespace ClinicHub.IntegrationTests.Catalog.Drugs;

/// <summary>
/// The drug list: ordering and paging (drugs tech § API and § Backend; overview § Conventions). Since M1.7 every list also
/// holds the shared catalog: these cases list the clinic's own drugs (<c>source=own</c>), newest first without a search
/// (design M1.7 D7, D12).
/// </summary>
[Collection(CatalogListCollection.Name)]
[Trait("Area", "catalog")]
public class DrugListTests(AppFixture app) : CatalogTest(app)
{
    [Fact]
    [Trait("Case", "DRUG-034")]
    public async Task Without_a_search_own_drugs_come_newest_first()
    {
        var (clinic, owner) = await EmptyClinicAsync();
        await Data.Drug(clinic).Named("Zinc");
        await Data.Drug(clinic).Named("atropine");
        await Data.Drug(clinic).Named("Tobradex");

        var list = await ListOwnDrugsAsync(owner);

        list.Items.Select(d => d.Name).ShouldBe(["Tobradex", "atropine", "Zinc"]);
    }

    [Fact]
    [Trait("Case", "DRUG-035")]
    public async Task Of_two_own_drugs_with_the_same_name_the_newer_comes_first()
    {
        var (clinic, owner) = await EmptyClinicAsync();
        var older = await Data.Drug(clinic).Named("Tobradex");
        var newer = await Data.Drug(clinic).Named("Tobradex");

        var list = await ListOwnDrugsAsync(owner);

        list.Items.Select(d => d.Id).ShouldBe([newer.Id, older.Id]);
    }

    [Fact]
    [Trait("Case", "DRUG-036")]
    public async Task Latin_names_come_before_Arabic_names()
    {
        var (clinic, owner) = await EmptyClinicAsync();
        // A search the four names only contain (without a search own drugs are newest first)
        var term = $"{Unique.Next()}";
        await Data.Drug(clinic).Named($"قطرة مرطبة {term}");
        await Data.Drug(clinic).Named($"Zinc {term}");
        await Data.Drug(clinic).Named($"أتروبين {term}");
        await Data.Drug(clinic).Named($"atropine {term}");

        var names = await SearchOwnDrugNamesAsync(owner, term);

        names.Count.ShouldBe(4);
        names.Take(2).ShouldBe([$"atropine {term}", $"Zinc {term}"]);
        names.Skip(2).ShouldBe([$"أتروبين {term}", $"قطرة مرطبة {term}"], ignoreOrder: true);
    }

    [Fact]
    [Trait("Case", "DRUG-045")]
    public async Task The_second_page_of_25_drugs_holds_the_last_5()
    {
        var (clinic, owner) = await EmptyClinicAsync();
        for (var i = 1; i <= 25; i++)
            await Data.Drug(clinic).Named($"Drug {i:D2}");

        var page = await ListOwnDrugsAsync(owner, "page=2&pageSize=20");

        // Newest first: the second page holds the 5 oldest
        page.Items.Select(d => d.Name).ShouldBe(["Drug 05", "Drug 04", "Drug 03", "Drug 02", "Drug 01"]);
        page.TotalCount.ShouldBe(25);
        page.Page.ShouldBe(2);
        page.PageSize.ShouldBe(20);
    }

    [Fact]
    [Trait("Case", "DRUG-046")]
    public async Task Without_paging_parameters_the_first_page_of_20_is_answered()
    {
        var owner = await OwnerAsync();

        var page = await ListDrugsAsync(owner);

        page.Page.ShouldBe(1);
        page.PageSize.ShouldBe(20);
    }

    [Theory]
    [Trait("Case", "DRUG-047")]
    [InlineData(0, 1)]
    [InlineData(-5, 1)]
    [InlineData(1, 1)]
    [InlineData(100, 100)]
    [InlineData(101, 100)]
    public async Task The_page_size_is_clamped_to_1_to_100(int asked, int answered)
    {
        var (clinic, owner) = await EmptyClinicAsync();
        for (var i = 0; i < 3; i++)
            await Data.Drug(clinic);

        var page = await ListOwnDrugsAsync(owner, $"pageSize={asked}");

        page.PageSize.ShouldBe(answered);
        page.Items.Count.ShouldBe(Math.Min(answered, 3));
        page.TotalCount.ShouldBe(3);
    }

    [Theory]
    [Trait("Case", "DRUG-048")]
    [InlineData(0)]
    [InlineData(-1)]
    public async Task A_page_below_1_is_answered_as_page_1(int asked)
    {
        var (clinic, owner) = await EmptyClinicAsync();
        await Data.Drug(clinic).Named("Tobradex");
        await Data.Drug(clinic).Named("Zinc");

        var page = await ListOwnDrugsAsync(owner, $"page={asked}");

        page.Page.ShouldBe(1);
        page.Items.Select(d => d.Name).ShouldBe(["Zinc", "Tobradex"]);
    }

    [Theory]
    [Trait("Case", "DRUG-049")]
    [InlineData("page=2")]
    [InlineData("page=2&pageSize=3")]
    [InlineData("page=2147483647")]
    [InlineData("page=2147483647&pageSize=100")]
    [InlineData("page=2147483647&pageSize=1")]
    public async Task A_page_past_the_end_is_empty_with_the_right_total(string query)
    {
        var (clinic, owner) = await EmptyClinicAsync();
        for (var i = 0; i < 3; i++)
            await Data.Drug(clinic);

        var page = await ListOwnDrugsAsync(owner, query);

        page.Items.ShouldBeEmpty();
        page.TotalCount.ShouldBe(3);
    }

    [Fact]
    [Trait("Case", "DRUG-050")]
    public async Task Every_listed_drug_includes_its_default_dosing_ingredients_kind_and_categories()
    {
        var (clinic, owner) = await EmptyClinicAsync();
        var dosing = Dosings.Drops(amount: 2, timesADay: 3, weeks: 2, eye: "right");
        await Data.Drug(clinic).Named("A with dosing").WithDosing(dosing).WithIngredients("TIMOLOL");
        await Data.Drug(clinic).Named("B without dosing").InCategory(CategoryIds.Other);

        var response = await owner.GetAsync($"{DrugsUrl}?source=own");
        var shared = await owner.GetAsync($"{DrugsUrl}?source=shared&pageSize=5");

        await response.ShouldBeOkAsync();
        var items = (await response.ReadNodeAsync())["items"].ShouldBeOfType<JsonArray>();
        items.Count.ShouldBe(2);
        await shared.ShouldBeOkAsync();
        var sharedItems = (await shared.ReadNodeAsync())["items"].ShouldBeOfType<JsonArray>();
        sharedItems.Count.ShouldBe(5);
        foreach (var item in items.Concat(sharedItems).Select(i => i!.AsObject()))
            foreach (var key in new[] { "defaultDosing", "activeIngredients", "isShared", "withdrawn", "category", "subCategory" })
                item.ContainsKey(key).ShouldBeTrue($"{item["name"]}: {key}");
        // Newest first
        var list = await ListOwnDrugsAsync(owner);
        list.Items.Select(d => d.Name).ShouldBe(["B without dosing", "A with dosing"]);
        list.Items[0].DefaultDosing.ShouldBeNull();
        list.Items[0].ActiveIngredients.ShouldBeNull();
        list.Items[0].Category.Id.ShouldBe(CategoryIds.Other);
        list.Items[0].SubCategory.ShouldBeNull();
        ShouldMatch(list.Items[1].DefaultDosing, dosing);
        list.Items[1].ActiveIngredients.ShouldBe("TIMOLOL");
        list.Items[1].Category.Id.ShouldBe(CategoryIds.Eye);
        list.Items[1].SubCategory.ShouldNotBeNull().Id.ShouldBe(SubCategoryIds.Glaucoma);
        list.Items.ShouldAllBe(d => !d.IsShared && !d.Withdrawn);
    }
}
