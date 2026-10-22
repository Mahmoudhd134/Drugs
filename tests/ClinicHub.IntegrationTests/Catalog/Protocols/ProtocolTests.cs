using System.Net;
using System.Text.Json.Nodes;
using ClinicHub.Application.Common.Search;
using ClinicHub.Application.Features.Catalog.Protocols;
using ClinicHub.Domain.Catalog;
using ClinicHub.IntegrationTests.Harness.Assertions;
using ClinicHub.IntegrationTests.Harness.Builders;
using ClinicHub.IntegrationTests.Harness.Hosting;
using Shouldly;

namespace ClinicHub.IntegrationTests.Catalog.Protocols;

/// <summary>Protocols: create, read, replace, delete, list and search (docs/features/protocols).</summary>
[Collection(CatalogProtocolsCollection.Name)]
[Trait("Area", "catalog")]
public class ProtocolTests(AppFixture app) : CatalogTest(app)
{
    [Fact]
    [Trait("Tier", "Smoke")]
    [Trait("Case", "GRP-001")]
    public async Task Creating_a_protocol_answers_201_with_its_lines_in_order()
    {
        var clinic = await SharedClinicAsync();
        var owner = await OwnerAsync();
        var a = await Data.Drug(clinic).WithDosing(Dosings.Drops());
        var b = await Data.Drug(clinic).WithDosing(Dosings.Drops(timesADay: 4, weeks: 2, eye: "right"));
        var c = await Data.Drug(clinic);

        var response = await PostProtocolAsync(owner, "Post cataract",
            Item(a.Id), Item(b.Id, new { frequency = "daily", frequencyValue = 6 }), Item(c.Id));

        await response.ShouldBeAsync(HttpStatusCode.Created);
        var protocol = await response.ReadAsync<ProtocolDto>();
        LocationPath(response).ShouldBe($"/api/v1/protocols/{protocol.Id}");
        protocol.Name.ShouldBe("Post cataract");
        protocol.Items.Select(i => i.Drug.Id).ShouldBe([a.Id, b.Id, c.Id]);
        protocol.Items[0].Drug.Name.ShouldBe(a.Name);
        ShouldMatch(protocol.Items[0].Drug.DefaultDosing, a.DefaultDosing);
        protocol.Items[0].Dosing.ShouldBeNull();
        ShouldMatch(protocol.Items[1].Drug.DefaultDosing, b.DefaultDosing);
        ShouldMatch(protocol.Items[1].Dosing, new Dosing { Frequency = "daily", FrequencyValue = 6 });
        protocol.Items[2].Drug.DefaultDosing.ShouldBeNull();
        protocol.Items[2].Dosing.ShouldBeNull();
        var node = (await response.ReadNodeAsync())["items"].ShouldBeOfType<JsonArray>();
        node.ShouldAllBe(item => item.AsObject().ContainsKey("drug") && item.AsObject().ContainsKey("dosing"));
        node.ShouldAllBe(item => item["drug"].AsObject().ContainsKey("defaultDosing"));
    }

    [Fact]
    [Trait("Case", "GRP-002")]
    public async Task A_protocol_is_read_back_with_its_lines_in_the_saved_order()
    {
        var clinic = await SharedClinicAsync();
        var owner = await OwnerAsync();
        var drugs = new List<int>();
        foreach (var name in new[] { "Zeta", "Alpha", "مرطب", "Beta" })
            drugs.Add((await Data.Drug(clinic).Named(name)).Id);
        var created = await CreateProtocolAsync(owner, "Ordered", [.. drugs.Select(id => Item(id))]);

        var protocol = await GetProtocolAsync(owner, created.Id);

        protocol.Name.ShouldBe("Ordered");
        protocol.Items.Select(i => i.Drug.Id).ShouldBe(drugs);
    }

    [Fact]
    [Trait("Tier", "Smoke")]
    [Trait("Case", "GRP-003")]
    public async Task Updating_a_protocol_replaces_its_name_and_every_line()
    {
        var clinic = await SharedClinicAsync();
        var owner = await OwnerAsync();
        var a = await Data.Drug(clinic);
        var b = await Data.Drug(clinic);
        var c = await Data.Drug(clinic);
        var created = await Data.Protocol(clinic).With(a).With(b).With(c, new Dosing { Eye = "left" });
        var aOverride = new Dosing { Frequency = "everyHours", FrequencyValue = 8, Eye = "right" };

        var response = await PutProtocolAsync(owner, created.Id, "Renamed", Item(c.Id), Item(a.Id, aOverride));

        await response.ShouldBeOkAsync();
        var answered = await response.ReadAsync<ProtocolDto>();
        answered.Name.ShouldBe("Renamed");
        var protocol = await GetProtocolAsync(owner, created.Id);
        protocol.Name.ShouldBe("Renamed");
        protocol.Items.Select(i => i.Drug.Id).ShouldBe([c.Id, a.Id]);
        protocol.Items[0].Dosing.ShouldBeNull();
        ShouldMatch(protocol.Items[1].Dosing, aOverride);
    }

    [Fact]
    [Trait("Case", "GRP-004")]
    public async Task Deleting_a_protocol_keeps_its_drugs()
    {
        var clinic = await SharedClinicAsync();
        var owner = await OwnerAsync();
        var a = await Data.Drug(clinic);
        var b = await Data.Drug(clinic);
        var protocol = await Data.Protocol(clinic).With(a).With(b);

        await (await owner.DeleteAsync($"{ProtocolsUrl}/{protocol.Id}")).ShouldBeAsync(HttpStatusCode.NoContent);

        await (await owner.GetAsync($"{ProtocolsUrl}/{protocol.Id}")).ShouldBeProblemAsync(HttpStatusCode.NotFound, "notFound");
        (await GetDrugAsync(owner, a.Id)).Id.ShouldBe(a.Id);
        (await GetDrugAsync(owner, b.Id)).Id.ShouldBe(b.Id);
    }

    [Fact]
    [Trait("Case", "GRP-005")]
    public async Task An_unknown_protocol_is_404_notFound_for_read_update_and_delete()
    {
        var clinic = await SharedClinicAsync();
        var owner = await OwnerAsync();
        var drug = await Data.Drug(clinic);

        await (await owner.GetAsync($"{ProtocolsUrl}/{UnknownId}")).ShouldBeProblemAsync(HttpStatusCode.NotFound, "notFound");
        await (await PutProtocolAsync(owner, UnknownId, "Valid", Item(drug.Id)))
            .ShouldBeProblemAsync(HttpStatusCode.NotFound, "notFound");
        await (await owner.DeleteAsync($"{ProtocolsUrl}/{UnknownId}")).ShouldBeProblemAsync(HttpStatusCode.NotFound, "notFound");
    }

    [Fact]
    [Trait("Case", "GRP-006")]
    public async Task Overrides_are_stored_normalized_and_an_empty_override_as_null()
    {
        var clinic = await SharedClinicAsync();
        var owner = await OwnerAsync();
        var a = await Data.Drug(clinic);
        var b = await Data.Drug(clinic);

        var created = await CreateProtocolAsync(owner, "Normalized",
            Item(a.Id, new
            {
                frequency = "asNeeded", frequencyValue = 3, frequencyText = "ignored",
                durationUnit = "continuous", durationValue = 5, eye = " ",
            }),
            Item(b.Id, new { }));

        var expected = new Dosing { Frequency = "asNeeded", DurationUnit = "continuous" };
        ShouldMatch(created.Items[0].Dosing, expected);
        created.Items[1].Dosing.ShouldBeNull();
        var protocol = await GetProtocolAsync(owner, created.Id);
        ShouldMatch(protocol.Items[0].Dosing, expected);
        protocol.Items[1].Dosing.ShouldBeNull();
    }

    [Fact]
    [Trait("Case", "GRP-007")]
    public async Task Null_items_are_dropped_and_the_order_kept()
    {
        var clinic = await SharedClinicAsync();
        var owner = await OwnerAsync();
        var a = await Data.Drug(clinic);
        var b = await Data.Drug(clinic);
        var c = await Data.Drug(clinic);

        var created = await CreateProtocolAsync(owner, "With nulls", null, Item(c.Id), null, Item(a.Id), null, Item(b.Id), null);

        created.Items.Select(i => i.Drug.Id).ShouldBe([c.Id, a.Id, b.Id]);
        (await GetProtocolAsync(owner, created.Id)).Items.Select(i => i.Drug.Id).ShouldBe([c.Id, a.Id, b.Id]);
    }

    [Fact]
    [Trait("Case", "GRP-008")]
    public async Task The_name_is_trimmed()
    {
        var clinic = await SharedClinicAsync();
        var owner = await OwnerAsync();
        var drug = await Data.Drug(clinic);

        var created = await CreateProtocolAsync(owner, "  Post cataract  ", Item(drug.Id));

        created.Name.ShouldBe("Post cataract");
        (await GetProtocolAsync(owner, created.Id)).Name.ShouldBe("Post cataract");
    }

    [Fact]
    [Trait("Case", "GRP-009")]
    public async Task Protocols_are_listed_by_name_then_id_with_their_lines()
    {
        var (clinic, owner) = await EmptyClinicAsync();
        var drug = await Data.Drug(clinic);
        var zeta = await Data.Protocol(clinic).Named("Zeta").With(drug);
        var arabic = await Data.Protocol(clinic).Named("التهاب").With(drug);
        var alpha = await Data.Protocol(clinic).Named("alpha").With(drug);
        var alpha2 = await Data.Protocol(clinic).Named("alpha").With(drug);

        var list = await ListProtocolsAsync(owner);

        list.Items.Select(g => g.Id).ShouldBe([alpha.Id, alpha2.Id, zeta.Id, arabic.Id]);
        list.Items.ShouldAllBe(g => g.Items.Count == 1 && g.Items[0].Drug.Id == drug.Id);
    }

    [Fact]
    [Trait("Case", "GRP-010")]
    public async Task The_protocol_search_is_a_case_insensitive_contains_paged_like_drugs()
    {
        var (clinic, owner) = await EmptyClinicAsync();
        await Data.Protocol(clinic).Named("Post Cataract");
        await Data.Protocol(clinic).Named("Catalog of drops");
        await Data.Protocol(clinic).Named("Glaucoma");
        await Data.Protocol(clinic).Named("بعد عملية المياه البيضاء");

        (await SearchProtocolNamesAsync(owner, "cat")).ShouldBe(["Catalog of drops", "Post Cataract"]);
        (await SearchProtocolNamesAsync(owner, "CAT")).ShouldBe(["Catalog of drops", "Post Cataract"]);
        (await SearchProtocolNamesAsync(owner, "المياه")).ShouldBe(["بعد عملية المياه البيضاء"]);
        var paged = await ListProtocolsAsync(owner, "search=cat&pageSize=1&page=2");
        paged.Items.Select(g => g.Name).ShouldBe(["Post Cataract"]);
        paged.TotalCount.ShouldBe(2);
        paged.Page.ShouldBe(2);
        paged.PageSize.ShouldBe(1);
        (await ListProtocolsAsync(owner, "pageSize=0")).PageSize.ShouldBe(1);
        (await ListProtocolsAsync(owner, "pageSize=101")).PageSize.ShouldBe(100);
        var defaults = await ListProtocolsAsync(owner);
        defaults.Page.ShouldBe(1);
        defaults.PageSize.ShouldBe(20);
        defaults.TotalCount.ShouldBe(4);
    }

    [Theory]
    [Trait("Case", "GRP-096")]
    [InlineData("التهاب", "بروتوكول إلتهاب")]
    [InlineData("بروتوكول", "بروتوكول إلتهاب")]
    [InlineData("بُرُوتُوكُول", "بروتوكول إلتهاب")]
    [InlineData("بروتـوكول", "بروتوكول إلتهاب")]
    [InlineData("عمليه المياة", "بعد عملية المياه")]
    [InlineData("الام", "علاج آلام")]
    public async Task The_protocol_search_is_Arabic_normalized(string search, string found)
    {
        var (clinic, owner) = await EmptyClinicAsync();
        await Data.Protocol(clinic).Named("بروتوكول إلتهاب");
        await Data.Protocol(clinic).Named("بعد عملية المياه");
        await Data.Protocol(clinic).Named("علاج آلام");

        (await SearchProtocolNamesAsync(owner, search)).ShouldBe([found]);
    }

    [Fact]
    [Trait("Case", "GRP-011")]
    public async Task A_changed_drug_default_shows_in_the_protocol_with_the_override_unchanged()
    {
        var clinic = await SharedClinicAsync();
        var owner = await OwnerAsync();
        var drug = await Data.Drug(clinic).WithDosing(Dosings.Drops(timesADay: 4, weeks: 1));
        var protocolOverride = new Dosing { Frequency = "daily", FrequencyValue = 6 };
        var protocol = await Data.Protocol(clinic).With(drug, protocolOverride);
        var newDefault = Dosings.Drops(amount: 2, timesADay: 3, weeks: 3, eye: "left");

        await (await PutDrugAsync(owner, drug.Id, drug.Name, defaultDosing: newDefault)).ShouldBeOkAsync();

        var line = (await GetProtocolAsync(owner, protocol.Id)).Items.ShouldHaveSingleItem();
        ShouldMatch(line.Drug.DefaultDosing, newDefault);
        ShouldMatch(line.Dosing, protocolOverride);
    }

    [Fact]
    [Trait("Case", "GRP-065")]
    public async Task Two_windows_saving_the_same_protocol_the_last_save_wins()
    {
        var clinic = await SharedClinicAsync();
        var first = await Login.OwnerAsync(clinic);
        var second = await Login.OwnerAsync(clinic);
        var a = await Data.Drug(clinic);
        var b = await Data.Drug(clinic);
        var c = await Data.Drug(clinic);
        var protocol = await Data.Protocol(clinic).With(a);
        // Both windows opened the protocol, then each saves its own edit
        await GetProtocolAsync(first, protocol.Id);
        await GetProtocolAsync(second, protocol.Id);

        await (await PutProtocolAsync(first, protocol.Id, "First edit", Item(a.Id), Item(b.Id))).ShouldBeOkAsync();
        await (await PutProtocolAsync(second, protocol.Id, "Second edit", Item(c.Id, new { eye = "ask" }))).ShouldBeOkAsync();

        var saved = await GetProtocolAsync(first, protocol.Id);
        saved.Name.ShouldBe("Second edit");
        saved.Items.Select(i => i.Drug.Id).ShouldBe([c.Id]);
        saved.Items[0].Dosing.Eye.ShouldBe("ask");
    }

    // The routes before the rename (design D10): no alias kept, so they answer as any unknown /api path (ERR-015,
    // ERR-016), also for a protocol and a drug that exist, and change nothing
    [Theory]
    [Trait("Case", "GRP-101")]
    [InlineData("/api/v1/drug-groups")]
    [InlineData("/api/v1/drug-groups/{protocol}")]
    [InlineData("/api/v1/drugs/{drug}/groups")]
    public async Task The_old_routes_answer_404_notFound_to_get_and_405_methodNotAllowed_to_post_put_and_delete(string template)
    {
        var (clinic, owner) = await EmptyClinicAsync();
        var drug = await Data.Drug(clinic);
        var protocol = await Data.Protocol(clinic).Named("Post cataract").With(drug);
        var url = template.Replace("{protocol}", protocol.Id.ToString()).Replace("{drug}", drug.Id.ToString());
        var body = ProtocolBody("Renamed through the old route", Item(drug.Id));

        await (await owner.GetAsync(url)).ShouldBeProblemAsync(HttpStatusCode.NotFound, "notFound");
        await (await owner.PostAsync(url, body)).ShouldBeProblemAsync(HttpStatusCode.MethodNotAllowed, "methodNotAllowed");
        await (await owner.PutAsync(url, body)).ShouldBeProblemAsync(HttpStatusCode.MethodNotAllowed, "methodNotAllowed");
        await (await owner.DeleteAsync(url)).ShouldBeProblemAsync(HttpStatusCode.MethodNotAllowed, "methodNotAllowed");

        var list = await ListProtocolsAsync(owner);
        list.Items.Select(g => g.Name).ShouldBe(["Post cataract"], "nothing created, renamed or deleted");
        (await GetProtocolAsync(owner, protocol.Id)).Items.Select(i => i.Drug.Id).ShouldBe([drug.Id]);
    }

    [Fact]
    [Trait("Case", "GRP-106")]
    public async Task A_renamed_protocol_is_searched_by_its_new_name_only()
    {
        var (clinic, owner) = await EmptyClinicAsync();
        var drug = await Data.Drug(clinic);
        var created = await CreateProtocolAsync(owner, "علاج آلام", Item(drug.Id));

        await (await PutProtocolAsync(owner, created.Id, "مُضاد حيوي", Item(drug.Id))).ShouldBeOkAsync();

        var stored = await App.OutsideTheApp.ScalarAsync<string>("""SELECT "SearchName" FROM "Protocols" WHERE "Id" = @p0""", created.Id);
        stored.ShouldBe(SearchText.Fold("مُضاد حيوي"));
        (await SearchProtocolNamesAsync(owner, "مضاد حيوي")).ShouldBe(["مُضاد حيوي"]);
        (await SearchProtocolNamesAsync(owner, "الام")).ShouldBeEmpty();
    }
}
