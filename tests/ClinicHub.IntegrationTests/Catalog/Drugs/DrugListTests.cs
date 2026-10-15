using System.Text.Json.Nodes;
using ClinicHub.IntegrationTests.Harness.Assertions;
using ClinicHub.IntegrationTests.Harness.Builders;
using ClinicHub.IntegrationTests.Harness.Hosting;
using Shouldly;

namespace ClinicHub.IntegrationTests.Catalog.Drugs;

/// <summary>The drug list: ordering and paging (drugs tech § API and § Backend; overview § Conventions).</summary>
[Collection(CatalogListCollection.Name)]
[Trait("Area", "catalog")]
public class DrugListTests(AppFixture app) : CatalogTest(app)
{
    [Fact]
    [Trait("Case", "DRUG-034")]
    public async Task Without_a_search_drugs_are_ordered_by_name_case_insensitively()
    {
        var (clinic, owner) = await EmptyClinicAsync();
        await Data.Drug(clinic).Named("Zinc");
        await Data.Drug(clinic).Named("atropine");
        await Data.Drug(clinic).Named("Tobradex");

        var list = await ListDrugsAsync(owner);

        list.Items.Select(d => d.Name).ShouldBe(["atropine", "Tobradex", "Zinc"]);
    }

    [Fact]
    [Trait("Case", "DRUG-035")]
    public async Task Drugs_with_the_same_name_are_ordered_by_id()
    {
        var (clinic, owner) = await EmptyClinicAsync();
        var older = await Data.Drug(clinic).Named("Tobradex");
        var newer = await Data.Drug(clinic).Named("Tobradex");

        var list = await ListDrugsAsync(owner);

        list.Items.Select(d => d.Id).ShouldBe([older.Id, newer.Id]);
    }

    [Fact]
    [Trait("Case", "DRUG-036")]
    public async Task Latin_names_come_before_Arabic_names()
    {
        var (clinic, owner) = await EmptyClinicAsync();
        await Data.Drug(clinic).Named("قطرة مرطبة");
        await Data.Drug(clinic).Named("Zinc");
        await Data.Drug(clinic).Named("أتروبين");
        await Data.Drug(clinic).Named("atropine");

        var names = (await ListDrugsAsync(owner)).Items.Select(d => d.Name).ToList();

        names.Count.ShouldBe(4);
        names.Take(2).ShouldBe(["atropine", "Zinc"]);
        names.Skip(2).ShouldBe(["أتروبين", "قطرة مرطبة"], ignoreOrder: true);
    }

    [Fact]
    [Trait("Case", "DRUG-045")]
    public async Task The_second_page_of_25_drugs_holds_the_last_5()
    {
        var (clinic, owner) = await EmptyClinicAsync();
        for (var i = 1; i <= 25; i++)
            await Data.Drug(clinic).Named($"Drug {i:D2}");

        var page = await ListDrugsAsync(owner, "page=2&pageSize=20");

        page.Items.Select(d => d.Name).ShouldBe(["Drug 21", "Drug 22", "Drug 23", "Drug 24", "Drug 25"]);
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

        var page = await ListDrugsAsync(owner, $"pageSize={asked}");

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

        var page = await ListDrugsAsync(owner, $"page={asked}");

        page.Page.ShouldBe(1);
        page.Items.Select(d => d.Name).ShouldBe(["Tobradex", "Zinc"]);
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

        var page = await ListDrugsAsync(owner, query);

        page.Items.ShouldBeEmpty();
        page.TotalCount.ShouldBe(3);
    }

    [Fact]
    [Trait("Case", "DRUG-050")]
    public async Task Every_listed_drug_includes_its_default_dosing()
    {
        var (clinic, owner) = await EmptyClinicAsync();
        var dosing = Dosings.Drops(amount: 2, timesADay: 3, weeks: 2, eye: "right");
        await Data.Drug(clinic).Named("A with dosing").WithDosing(dosing);
        await Data.Drug(clinic).Named("B without dosing");

        var response = await owner.GetAsync(DrugsUrl);

        await response.ShouldBeOkAsync();
        var items = (await response.ReadNodeAsync())["items"].ShouldBeOfType<JsonArray>();
        items.Count.ShouldBe(2);
        items.ShouldAllBe(item => item.AsObject().ContainsKey("defaultDosing"));
        var list = await ListDrugsAsync(owner);
        ShouldMatch(list.Items[0].DefaultDosing, dosing);
        list.Items[1].DefaultDosing.ShouldBeNull();
    }
}
