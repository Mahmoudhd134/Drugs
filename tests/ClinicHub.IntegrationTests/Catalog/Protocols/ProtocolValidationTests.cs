using System.Net;
using ClinicHub.Domain.Catalog;
using ClinicHub.IntegrationTests.Harness.Assertions;
using ClinicHub.IntegrationTests.Harness.Builders;
using ClinicHub.IntegrationTests.Harness.Hosting;
using Shouldly;

namespace ClinicHub.IntegrationTests.Catalog.Protocols;

/// <summary>
/// A protocol's rules: name, lines, limits, overrides, the effective-eye duplicate rule and the report order
/// (protocols tech § API and § Backend; protocols § القواعد).
/// </summary>
[Collection(CatalogProtocolsCollection.Name)]
[Trait("Area", "catalog")]
public class ProtocolValidationTests(AppFixture app) : CatalogTest(app)
{
    [Fact]
    [Trait("Case", "GRP-012")]
    public async Task An_empty_name_is_400_nameRequired()
    {
        var clinic = await SharedClinicAsync();
        var owner = await OwnerAsync();
        var drug = await Data.Drug(clinic);

        var problem = await (await PostProtocolAsync(owner, "", Item(drug.Id)))
            .ShouldBeProblemAsync(HttpStatusCode.BadRequest, "nameRequired");

        problem.ShouldHaveError("name", "nameRequired");
    }

    [Fact]
    [Trait("Case", "GRP-013")]
    public async Task A_name_of_256_characters_is_accepted_and_257_is_nameTooLong()
    {
        var clinic = await SharedClinicAsync();
        var owner = await OwnerAsync();
        var drug = await Data.Drug(clinic);
        var name = "G" + new string('x', 254) + "Z";

        var created = await CreateProtocolAsync(owner, name, Item(drug.Id));
        var tooLong = await PostProtocolAsync(owner, name + "x", Item(drug.Id));

        name.Length.ShouldBe(256);
        (await GetProtocolAsync(owner, created.Id)).Name.ShouldBe(name);
        (await tooLong.ShouldBeProblemAsync(HttpStatusCode.BadRequest, "nameTooLong")).ShouldHaveError("name", "nameTooLong");
    }

    [Theory]
    [Trait("Case", "GRP-014")]
    [InlineData("Post\ncataract")]
    [InlineData("Post\u202Ecataract")]
    [InlineData("Post\u2067cataract")]
    public async Task A_name_with_a_line_break_or_a_bidi_control_is_nameInvalid(string name)
    {
        var clinic = await SharedClinicAsync();
        var owner = await OwnerAsync();
        var drug = await Data.Drug(clinic);

        await (await PostProtocolAsync(owner, name, Item(drug.Id))).ShouldBeProblemAsync(HttpStatusCode.BadRequest, "nameInvalid");
    }

    [Fact]
    [Trait("Case", "GRP-015")]
    public async Task No_items_is_400_drugsRequired_on_items()
    {
        var owner = await OwnerAsync();

        var problem = await (await PostProtocolAsync(owner, "Empty")).ShouldBeProblemAsync(HttpStatusCode.BadRequest, "drugsRequired");

        problem.ShouldHaveError("items", "drugsRequired");
    }

    [Fact]
    [Trait("Case", "GRP-016")]
    public async Task Missing_items_or_only_null_items_are_drugsRequired()
    {
        var owner = await OwnerAsync();

        await (await owner.PostAsync(ProtocolsUrl, new { name = "No items" }))
            .ShouldBeProblemAsync(HttpStatusCode.BadRequest, "drugsRequired");
        await (await owner.PostAsync(ProtocolsUrl, new { name = "Null items", items = new object[] { null, null } }))
            .ShouldBeProblemAsync(HttpStatusCode.BadRequest, "drugsRequired");
    }

    [Fact]
    [Trait("Case", "GRP-017")]
    public async Task A_protocol_of_1000_lines_is_accepted()
    {
        var clinic = await SharedClinicAsync();
        var owner = await OwnerAsync();
        var items = await DistinctLinesAsync(clinic.Id, 1000);

        var response = await PostProtocolAsync(owner, "Big protocol", [.. items]);

        await response.ShouldBeAsync(HttpStatusCode.Created);
    }

    [Fact]
    [Trait("Case", "GRP-018")]
    public async Task A_protocol_of_1001_lines_is_invalidRequest_without_per_item_errors()
    {
        var clinic = await SharedClinicAsync();
        var owner = await OwnerAsync();
        var items = await DistinctLinesAsync(clinic.Id, 1000);
        // One more line, with an invalid override: its own error must not be listed
        items.Add(Item((await Data.Drug(clinic)).Id, new { frequency = "daily" }));

        var problem = await (await PostProtocolAsync(owner, "Too big", [.. items]))
            .ShouldBeProblemAsync(HttpStatusCode.BadRequest, "invalidRequest");

        problem.ShouldHaveError("items", "invalidRequest");
        problem.Errors.ShouldNotContain(e => e.Field != null && e.Field.StartsWith("items["));
        problem.Errors.ShouldHaveSingleItem();
    }

    [Fact]
    [Trait("Case", "GRP-020")]
    public async Task An_invalid_override_is_invalidDosing_on_its_line()
    {
        var clinic = await SharedClinicAsync();
        var owner = await OwnerAsync();
        var a = await Data.Drug(clinic);
        var b = await Data.Drug(clinic);

        var problem = await (await PostProtocolAsync(owner, "Bad line", Item(a.Id), Item(b.Id, new { frequency = "daily" })))
            .ShouldBeProblemAsync(HttpStatusCode.BadRequest, "invalidDosing");

        problem.ShouldHaveError("items[1].dosing", "invalidDosing");
    }

    [Fact]
    [Trait("Case", "GRP-021")]
    public async Task An_override_eye_ask_is_kept_on_the_line()
    {
        var clinic = await SharedClinicAsync();
        var owner = await OwnerAsync();
        var drug = await Data.Drug(clinic);

        var created = await CreateProtocolAsync(owner, "Ask", Item(drug.Id, new { eye = "ask" }));

        created.Items.ShouldHaveSingleItem().Dosing.Eye.ShouldBe("ask");
        (await GetProtocolAsync(owner, created.Id)).Items.ShouldHaveSingleItem().Dosing.Eye.ShouldBe("ask");
    }

    [Fact]
    [Trait("Tier", "Smoke")]
    [Trait("Case", "GRP-022")]
    public async Task The_same_drug_twice_for_the_same_override_eye_is_duplicateProtocolItem()
    {
        var clinic = await SharedClinicAsync();
        var owner = await OwnerAsync();
        var drug = await Data.Drug(clinic);

        var problem = await (await PostProtocolAsync(owner, "Twice",
                Item(drug.Id, new { eye = "right" }), Item(drug.Id, new { eye = "right", frequency = "bedtime" })))
            .ShouldBeProblemAsync(HttpStatusCode.BadRequest, "duplicateProtocolItem");

        problem.ShouldHaveError("items", "duplicateProtocolItem");
    }

    [Fact]
    [Trait("Case", "GRP-023")]
    public async Task With_an_empty_name_a_duplicate_is_not_reported()
    {
        var clinic = await SharedClinicAsync();
        var owner = await OwnerAsync();
        var drug = await Data.Drug(clinic);

        var problem = await (await PostProtocolAsync(owner, "", Item(drug.Id), Item(drug.Id)))
            .ShouldBeProblemAsync(HttpStatusCode.BadRequest, "nameRequired");

        problem.Codes.ShouldBe(["nameRequired"]);
    }

    [Fact]
    [Trait("Case", "GRP-024")]
    public async Task The_same_drug_for_the_right_and_the_left_eye_is_accepted()
    {
        var clinic = await SharedClinicAsync();
        var owner = await OwnerAsync();
        var drug = await Data.Drug(clinic);

        var created = await CreateProtocolAsync(owner, "Both eyes",
            Item(drug.Id, new { eye = "right", frequency = "daily", frequencyValue = 4 }),
            Item(drug.Id, new { eye = "left", frequency = "daily", frequencyValue = 2 }));

        created.Items.Select(i => (i.Drug.Id, i.Dosing.Eye)).ShouldBe([(drug.Id, "right"), (drug.Id, "left")]);
    }

    [Fact]
    [Trait("Case", "GRP-025")]
    public async Task The_same_drug_twice_without_any_eye_is_duplicateProtocolItem()
    {
        var clinic = await SharedClinicAsync();
        var owner = await OwnerAsync();
        var drug = await Data.Drug(clinic).WithDosing(Dosings.Tablets());

        await (await PostProtocolAsync(owner, "Twice", Item(drug.Id), Item(drug.Id)))
            .ShouldBeProblemAsync(HttpStatusCode.BadRequest, "duplicateProtocolItem");
    }

    [Fact]
    [Trait("Case", "GRP-026")]
    public async Task Ask_is_an_eye_of_its_own()
    {
        var clinic = await SharedClinicAsync();
        var owner = await OwnerAsync();
        var drug = await Data.Drug(clinic);

        await (await PostProtocolAsync(owner, "Ask twice", Item(drug.Id, new { eye = "ask" }), Item(drug.Id, new { eye = "ask" })))
            .ShouldBeProblemAsync(HttpStatusCode.BadRequest, "duplicateProtocolItem");
        var created = await CreateProtocolAsync(owner, "Ask and right",
            Item(drug.Id, new { eye = "ask" }), Item(drug.Id, new { eye = "right" }));
        created.Items.Select(i => i.Dosing.Eye).ShouldBe(["ask", "right"]);
    }

    [Fact]
    [Trait("Tier", "Smoke")]
    [Trait("Case", "GRP-027")]
    public async Task A_line_without_override_takes_the_drugs_default_eye()
    {
        var clinic = await SharedClinicAsync();
        var owner = await OwnerAsync();
        var drug = await Data.Drug(clinic).WithDosing(new Dosing { Eye = "right" });

        await (await PostProtocolAsync(owner, "Effective right", Item(drug.Id), Item(drug.Id, new { eye = "right" })))
            .ShouldBeProblemAsync(HttpStatusCode.BadRequest, "duplicateProtocolItem");
    }

    [Fact]
    [Trait("Case", "GRP-028")]
    public async Task No_eye_and_eye_none_are_the_same_eye()
    {
        var clinic = await SharedClinicAsync();
        var owner = await OwnerAsync();
        var drug = await Data.Drug(clinic).WithDosing(Dosings.Tablets());

        await (await PostProtocolAsync(owner, "None twice", Item(drug.Id), Item(drug.Id, new { eye = "none" })))
            .ShouldBeProblemAsync(HttpStatusCode.BadRequest, "duplicateProtocolItem");
    }

    [Fact]
    [Trait("Tier", "Smoke")]
    [Trait("Case", "GRP-029")]
    public async Task A_clash_after_the_drugs_default_eye_changed_blocks_the_save_but_still_reads()
    {
        var clinic = await SharedClinicAsync();
        var owner = await OwnerAsync();
        var drug = await Data.Drug(clinic).WithDosing(new Dosing { Eye = "right" });
        var protocol = await CreateProtocolAsync(owner, "Clash", Item(drug.Id), Item(drug.Id, new { eye = "left" }));

        await (await PutDrugAsync(owner, drug.Id, drug.Name, defaultDosing: new { eye = "left" })).ShouldBeOkAsync();
        var response = await PutProtocolAsync(owner, protocol.Id, "Clash renamed", Item(drug.Id), Item(drug.Id, new { eye = "left" }));

        (await response.ShouldBeProblemAsync(HttpStatusCode.BadRequest, "duplicateProtocolItem")).ShouldHaveError("items", "duplicateProtocolItem");
        var read = await GetProtocolAsync(owner, protocol.Id);
        read.Name.ShouldBe("Clash");
        read.Items.Count.ShouldBe(2);
        read.Items[0].Dosing.ShouldBeNull();
        read.Items[0].Drug.DefaultDosing.Eye.ShouldBe("left");
        read.Items[1].Dosing.Eye.ShouldBe("left");
    }

    [Fact]
    [Trait("Case", "GRP-030")]
    public async Task An_unknown_drug_is_400_drugNotFound()
    {
        var clinic = await SharedClinicAsync();
        var owner = await OwnerAsync();
        var drug = await Data.Drug(clinic);

        await (await PostProtocolAsync(owner, "Unknown drug", Item(drug.Id), Item(UnknownId)))
            .ShouldBeProblemAsync(HttpStatusCode.BadRequest, "drugNotFound");
    }

    [Fact]
    [Trait("Case", "GRP-031")]
    public async Task With_an_empty_name_an_unknown_drug_is_not_reported()
    {
        var owner = await OwnerAsync();

        var problem = await (await PostProtocolAsync(owner, "", Item(UnknownId)))
            .ShouldBeProblemAsync(HttpStatusCode.BadRequest, "nameRequired");

        problem.Codes.ShouldBe(["nameRequired"]);
    }

    [Fact]
    [Trait("Case", "GRP-032")]
    public async Task The_handler_reports_an_unknown_drug_then_a_duplicate_then_an_unknown_protocol()
    {
        var clinic = await SharedClinicAsync();
        var owner = await OwnerAsync();
        var drug = await Data.Drug(clinic);
        var protocol = await Data.Protocol(clinic).With(drug);

        // Unknown protocol + unknown drug: drugNotFound before the 404
        await (await PutProtocolAsync(owner, UnknownId, "Valid", Item(UnknownId)))
            .ShouldBeProblemAsync(HttpStatusCode.BadRequest, "drugNotFound");
        // Unknown drug + duplicate lines: the unknown drug first (create and update)
        await (await PostProtocolAsync(owner, "Both", Item(drug.Id), Item(drug.Id), Item(UnknownId)))
            .ShouldBeProblemAsync(HttpStatusCode.BadRequest, "drugNotFound");
        await (await PutProtocolAsync(owner, protocol.Id, "Both", Item(drug.Id), Item(drug.Id), Item(UnknownId)))
            .ShouldBeProblemAsync(HttpStatusCode.BadRequest, "drugNotFound");
        // Duplicate lines + unknown protocol: the duplicate before the 404
        await (await PutProtocolAsync(owner, UnknownId, "Valid", Item(drug.Id), Item(drug.Id)))
            .ShouldBeProblemAsync(HttpStatusCode.BadRequest, "duplicateProtocolItem");
    }

    [Fact]
    [Trait("Case", "GRP-033")]
    public async Task An_empty_name_and_no_items_report_both_in_order()
    {
        var owner = await OwnerAsync();

        var problem = await (await PostProtocolAsync(owner, "")).ShouldBeProblemAsync(HttpStatusCode.BadRequest, "nameRequired");

        problem.Codes.ShouldBe(["nameRequired", "drugsRequired"]);
    }

    /// <summary><paramref name="count"/> lines with distinct (drug, eye) pairs: new drugs, each with the 5 protocol eyes.</summary>
    private async Task<List<object>> DistinctLinesAsync(int clinicId, int count)
    {
        var lines = new List<object>();
        while (lines.Count < count)
        {
            var drug = await Data.Drug(clinicId);
            foreach (var eye in DosingCodes.ProtocolEyes.Take(count - lines.Count))
                lines.Add(Item(drug.Id, new { eye }));
        }
        return lines;
    }
}
