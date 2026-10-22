using System.Net;
using System.Text.Json.Nodes;
using ClinicHub.Application.Features.Catalog.Drugs;
using ClinicHub.Domain.Catalog;
using ClinicHub.IntegrationTests.Harness.Assertions;
using ClinicHub.IntegrationTests.Harness.Builders;
using ClinicHub.IntegrationTests.Harness.Hosting;
using Shouldly;

namespace ClinicHub.IntegrationTests.Catalog.Drugs;

/// <summary>Drug details, create, update and delete (docs/features/drugs).</summary>
[Collection(CatalogCollection.Name)]
[Trait("Area", "catalog")]
public class DrugTests(AppFixture app) : CatalogTest(app)
{
    [Fact]
    [Trait("Tier", "Smoke")]
    [Trait("Case", "DRUG-001")]
    public async Task Creating_a_drug_answers_201_with_the_drug_and_its_location()
    {
        var owner = await OwnerAsync();

        var response = await PostDrugAsync(owner, "Tobradex", "Antibiotic + steroid");

        await response.ShouldBeAsync(HttpStatusCode.Created);
        var body = (await response.ReadNodeAsync()).AsObject();
        var id = body["id"]!.GetValue<int>();
        id.ShouldBeGreaterThan(0);
        body["name"]!.GetValue<string>().ShouldBe("Tobradex");
        body["description"]!.GetValue<string>().ShouldBe("Antibiotic + steroid");
        body.ContainsKey("defaultDosing").ShouldBeTrue("defaultDosing is returned (null)");
        body["defaultDosing"].ShouldBeNull();
        LocationPath(response).ShouldBe($"/api/v1/drugs/{id}");
    }

    [Fact]
    [Trait("Case", "DRUG-002")]
    public async Task A_created_drug_is_read_back_with_its_name_description_and_default_dosing()
    {
        var owner = await OwnerAsync();
        var dosing = Dosings.Drops(amount: 2, timesADay: 6, weeks: 2, eye: "left");
        var created = await CreateDrugAsync(owner, "Vigamox", "Antibiotic", dosing);

        var drug = await GetDrugAsync(owner, created.Id);

        drug.Id.ShouldBe(created.Id);
        drug.Name.ShouldBe("Vigamox");
        drug.Description.ShouldBe("Antibiotic");
        ShouldMatch(drug.DefaultDosing, dosing);
    }

    [Fact]
    [Trait("Case", "DRUG-003")]
    public async Task Arabic_name_and_multi_line_description_are_stored_exactly_as_typed()
    {
        var owner = await OwnerAsync();
        const string description = "قطرة للعين الجافة\nتستخدم عند اللزوم\nلا تلمس العين بطرف العبوة";

        var created = await CreateDrugAsync(owner, "قطرة مرطبة", description);
        var drug = await GetDrugAsync(owner, created.Id);

        created.Name.ShouldBe("قطرة مرطبة");
        drug.Name.ShouldBe("قطرة مرطبة");
        drug.Description.ShouldBe(description);
    }

    [Fact]
    [Trait("Case", "DRUG-004")]
    public async Task Name_and_description_are_trimmed()
    {
        var owner = await OwnerAsync();

        var created = await CreateDrugAsync(owner, "  Tobradex  ", "  text  ");
        var drug = await GetDrugAsync(owner, created.Id);

        drug.Name.ShouldBe("Tobradex");
        drug.Description.ShouldBe("text");
    }

    [Theory]
    [Trait("Case", "DRUG-005")]
    [InlineData("")]
    [InlineData("   ")]
    [InlineData(" \t ")]
    public async Task A_blank_description_is_stored_as_null(string description)
    {
        var owner = await OwnerAsync();

        var created = await CreateDrugAsync(owner, "Tobradex", description);

        created.Description.ShouldBeNull();
        (await GetDrugAsync(owner, created.Id)).Description.ShouldBeNull();
    }

    [Fact]
    [Trait("Case", "DRUG-006")]
    public async Task Line_breaks_and_tabs_inside_the_description_are_kept()
    {
        var owner = await OwnerAsync();
        const string description = "Line one\r\n\tindented\nlast\tline";

        var created = await CreateDrugAsync(owner, "Tobradex", description);

        (await GetDrugAsync(owner, created.Id)).Description.ShouldBe(description);
    }

    [Fact]
    [Trait("Tier", "Smoke")]
    [Trait("Case", "DRUG-007")]
    public async Task Updating_a_drug_answers_the_new_values_and_a_later_read_returns_them()
    {
        var owner = await OwnerAsync();
        var created = await CreateDrugAsync(owner, "Tobradex", "Old", Dosings.Drops());
        var dosing = Dosings.Tablets(amount: 2, everyHours: 12, days: 10);

        var response = await PutDrugAsync(owner, created.Id, "Tobradex ST", "New description", dosing);

        await response.ShouldBeOkAsync();
        var updated = await response.ReadAsync<DrugDto>();
        updated.Id.ShouldBe(created.Id);
        updated.Name.ShouldBe("Tobradex ST");
        updated.Description.ShouldBe("New description");
        ShouldMatch(updated.DefaultDosing, dosing);
        var read = await GetDrugAsync(owner, created.Id);
        read.Name.ShouldBe("Tobradex ST");
        read.Description.ShouldBe("New description");
        ShouldMatch(read.DefaultDosing, dosing);
    }

    [Fact]
    [Trait("Case", "DRUG-008")]
    public async Task Reading_an_unknown_drug_is_404_notFound()
    {
        var owner = await OwnerAsync();

        await (await owner.GetAsync($"{DrugsUrl}/{UnknownId}")).ShouldBeProblemAsync(HttpStatusCode.NotFound, "notFound");
    }

    [Fact]
    [Trait("Case", "DRUG-009")]
    public async Task Updating_an_unknown_drug_with_a_valid_body_is_404_notFound()
    {
        var owner = await OwnerAsync();

        var response = await PutDrugAsync(owner, UnknownId, "Tobradex", "text", Dosings.Drops());

        await response.ShouldBeProblemAsync(HttpStatusCode.NotFound, "notFound");
    }

    [Fact]
    [Trait("Case", "DRUG-010")]
    public async Task Updating_an_unknown_drug_with_an_empty_name_is_400_nameRequired_before_the_404()
    {
        var owner = await OwnerAsync();

        var response = await PutDrugAsync(owner, UnknownId, "");

        await response.ShouldBeProblemAsync(HttpStatusCode.BadRequest, "nameRequired");
    }

    [Fact]
    [Trait("Case", "DRUG-011")]
    public async Task Two_drugs_may_share_a_name_and_both_are_listed()
    {
        var owner = await OwnerAsync();
        var name = Unique.Name("Tobradex", "توبراديكس");

        var first = await CreateDrugAsync(owner, name);
        var second = await CreateDrugAsync(owner, name);

        second.Id.ShouldNotBe(first.Id);
        var listed = await ListDrugsAsync(owner, $"search={Uri.EscapeDataString(name)}");
        listed.TotalCount.ShouldBe(2);
        listed.Items.Select(d => d.Id).ShouldBe([first.Id, second.Id], ignoreOrder: true);
    }

    [Fact]
    [Trait("Case", "DRUG-074")]
    public async Task The_protocols_using_a_drug_are_listed_by_name()
    {
        var clinic = await SharedClinicAsync();
        var owner = await OwnerAsync();
        var drug = await Data.Drug(clinic);
        var other = await Data.Drug(clinic);
        await Data.Protocol(clinic).Named("التهاب الملتحمة").With(drug).With(other);
        await Data.Protocol(clinic).Named("Post cataract").With(other).With(drug);
        await Data.Protocol(clinic).Named("Unrelated").With(other);

        var response = await owner.GetAsync($"{DrugsUrl}/{drug.Id}/protocols");

        await response.ShouldBeOkAsync();
        // Latin names before Arabic ones (drugs § القواعد: the same name ordering as the lists)
        (await response.ReadAsync<List<string>>()).ShouldBe(["Post cataract", "التهاب الملتحمة"]);
    }

    [Fact]
    [Trait("Case", "DRUG-075")]
    public async Task A_protocol_using_the_drug_twice_is_named_once()
    {
        var clinic = await SharedClinicAsync();
        var owner = await OwnerAsync();
        var drug = await Data.Drug(clinic);
        var protocol = await Data.Protocol(clinic)
            .With(drug, new Dosing { Eye = "right" })
            .With(drug, new Dosing { Eye = "left" });

        var response = await owner.GetAsync($"{DrugsUrl}/{drug.Id}/protocols");

        await response.ShouldBeOkAsync();
        (await response.ReadAsync<List<string>>()).ShouldBe([protocol.Name]);
    }

    [Fact]
    [Trait("Case", "DRUG-076")]
    public async Task The_protocols_of_an_unknown_drug_are_an_empty_list()
    {
        var owner = await OwnerAsync();

        var response = await owner.GetAsync($"{DrugsUrl}/{UnknownId}/protocols");

        await response.ShouldBeOkAsync();
        var body = await response.ReadNodeAsync();
        body.ShouldBeOfType<JsonArray>().Count.ShouldBe(0);
    }

    [Fact]
    [Trait("Tier", "Smoke")]
    [Trait("Case", "DRUG-077")]
    public async Task Deleting_a_drug_removes_it_and_its_protocol_lines_and_keeps_the_protocols()
    {
        var clinic = await SharedClinicAsync();
        var owner = await OwnerAsync();
        var drug = await Data.Drug(clinic);
        var other = await Data.Drug(clinic);
        var shared = await Data.Protocol(clinic).With(other).With(drug);
        var only = await Data.Protocol(clinic).With(drug);

        var response = await owner.DeleteAsync($"{DrugsUrl}/{drug.Id}");

        await response.ShouldBeAsync(HttpStatusCode.NoContent);
        await (await owner.GetAsync($"{DrugsUrl}/{drug.Id}")).ShouldBeProblemAsync(HttpStatusCode.NotFound, "notFound");
        var sharedNow = await GetProtocolAsync(owner, shared.Id);
        sharedNow.Items.Select(i => i.Drug.Id).ShouldBe([other.Id]);
        // A protocol can be left with no line (protocols tech § Data model)
        (await GetProtocolAsync(owner, only.Id)).Items.ShouldBeEmpty();
        (await GetDrugAsync(owner, other.Id)).Id.ShouldBe(other.Id);
    }

    [Fact]
    [Trait("Case", "DRUG-078")]
    public async Task Deleting_an_unknown_or_already_deleted_drug_is_404_notFound()
    {
        var owner = await OwnerAsync();
        var drug = await CreateDrugAsync(owner, "Tobradex");
        await (await owner.DeleteAsync($"{DrugsUrl}/{drug.Id}")).ShouldBeAsync(HttpStatusCode.NoContent);

        await (await owner.DeleteAsync($"{DrugsUrl}/{drug.Id}")).ShouldBeProblemAsync(HttpStatusCode.NotFound, "notFound");
        await (await owner.DeleteAsync($"{DrugsUrl}/{UnknownId}")).ShouldBeProblemAsync(HttpStatusCode.NotFound, "notFound");
    }
}
