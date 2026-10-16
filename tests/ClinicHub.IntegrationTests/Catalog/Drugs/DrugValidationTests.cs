using System.Net;
using ClinicHub.Domain.Catalog;
using ClinicHub.IntegrationTests.Harness.Assertions;
using ClinicHub.IntegrationTests.Harness.Builders;
using ClinicHub.IntegrationTests.Harness.Hosting;
using Shouldly;

namespace ClinicHub.IntegrationTests.Catalog.Drugs;

/// <summary>A drug's name, description and default dosing rules (drugs tech § API and § Backend).</summary>
[Collection(CatalogCollection.Name)]
[Trait("Area", "catalog")]
public class DrugValidationTests(AppFixture app) : CatalogTest(app)
{
    [Fact]
    [Trait("Case", "DRUG-012")]
    [Trait("Case", "DOSE-059")]
    [Trait("Case", "DOSE-065")]
    public async Task An_all_empty_default_dosing_is_stored_and_returned_as_null()
    {
        var owner = await OwnerAsync();

        var created = await CreateDrugAsync(owner, "Tobradex", defaultDosing: new { });

        created.DefaultDosing.ShouldBeNull();
        (await GetDrugAsync(owner, created.Id)).DefaultDosing.ShouldBeNull();
    }

    [Fact]
    [Trait("Case", "DOSE-059")]
    [Trait("Case", "DOSE-065")]
    public async Task A_dosing_whose_fields_are_all_blank_saved_over_a_dosing_is_stored_as_null()
    {
        var owner = await OwnerAsync();
        var created = await CreateDrugAsync(owner, "Tobradex", defaultDosing: Dosings.Drops());
        var blank = new
        {
            doseAmount = (decimal?)null, doseUnit = " ", frequency = "", frequencyValue = (int?)null, frequencyText = "  ",
            durationValue = (int?)null, durationUnit = "", eye = " ", taperSteps = Array.Empty<object>(),
        };

        var response = await PutDrugAsync(owner, created.Id, "Tobradex", defaultDosing: blank);

        await response.ShouldBeOkAsync();
        var node = (await response.ReadNodeAsync()).AsObject();
        node.ContainsKey("defaultDosing").ShouldBeTrue();
        node["defaultDosing"].ShouldBeNull();
        (await GetDrugAsync(owner, created.Id)).DefaultDosing.ShouldBeNull();
    }

    [Fact]
    [Trait("Case", "DRUG-013")]
    public async Task A_valid_dosing_with_fields_that_dont_apply_is_answered_normalized()
    {
        var owner = await OwnerAsync();

        var created = await CreateDrugAsync(owner, "Tobradex",
            defaultDosing: new { doseAmount = 1, doseUnit = "drop", frequency = "bedtime", frequencyValue = 3 });

        ShouldMatch(created.DefaultDosing, new Dosing { DoseAmount = 1, DoseUnit = "drop", Frequency = "bedtime" });
        created.DefaultDosing.FrequencyValue.ShouldBeNull();
        ShouldMatch((await GetDrugAsync(owner, created.Id)).DefaultDosing,
            new Dosing { DoseAmount = 1, DoseUnit = "drop", Frequency = "bedtime" });
    }

    [Fact]
    [Trait("Tier", "Smoke")]
    [Trait("Case", "DRUG-014")]
    public async Task An_invalid_default_dosing_is_400_invalidDosing_and_nothing_is_saved()
    {
        var owner = await OwnerAsync();
        var name = Unique.Name("Tobradex", "توبراديكس");

        // An amount without a unit
        var response = await PostDrugAsync(owner, name, defaultDosing: new { doseAmount = 1 });

        var problem = await response.ShouldBeProblemAsync(HttpStatusCode.BadRequest, "invalidDosing");
        problem.ShouldHaveError("defaultDosing", "invalidDosing");
        (await ListDrugsAsync(owner, $"search={Uri.EscapeDataString(name)}")).TotalCount.ShouldBe(0);
    }

    [Fact]
    [Trait("Case", "DRUG-015")]
    public async Task An_empty_name_is_400_nameRequired_on_name()
    {
        var owner = await OwnerAsync();

        var problem = await (await PostDrugAsync(owner, "")).ShouldBeProblemAsync(HttpStatusCode.BadRequest, "nameRequired");

        problem.ShouldHaveError("name", "nameRequired");
    }

    [Fact]
    [Trait("Case", "DRUG-016")]
    public async Task A_missing_name_is_400_nameRequired()
    {
        var owner = await OwnerAsync();

        var response = await owner.PostAsync(DrugsUrl, new { description = "text" });

        await response.ShouldBeProblemAsync(HttpStatusCode.BadRequest, "nameRequired");
    }

    [Theory]
    [Trait("Case", "DRUG-017")]
    [InlineData(" ")]
    [InlineData("   ")]
    public async Task A_name_of_only_spaces_is_400_nameRequired(string name)
    {
        var owner = await OwnerAsync();

        await (await PostDrugAsync(owner, name)).ShouldBeProblemAsync(HttpStatusCode.BadRequest, "nameRequired");
    }

    [Theory]
    [Trait("Case", "DRUG-018")]
    [InlineData("\u200B")]
    [InlineData("\u200B\u200B \u200B")]
    public async Task A_name_of_only_invisible_format_characters_is_400_nameRequired(string name)
    {
        var owner = await OwnerAsync();

        await (await PostDrugAsync(owner, name)).ShouldBeProblemAsync(HttpStatusCode.BadRequest, "nameRequired");
    }

    [Fact]
    [Trait("Case", "DRUG-019")]
    public async Task A_name_of_exactly_256_characters_is_stored_in_full()
    {
        var owner = await OwnerAsync();
        var name = "T" + new string('x', 254) + "Z";

        var created = await CreateDrugAsync(owner, name);

        name.Length.ShouldBe(256);
        (await GetDrugAsync(owner, created.Id)).Name.ShouldBe(name);
    }

    [Fact]
    [Trait("Case", "DRUG-020")]
    public async Task A_name_of_257_characters_is_400_nameTooLong()
    {
        var owner = await OwnerAsync();

        var problem = await (await PostDrugAsync(owner, new string('x', 257)))
            .ShouldBeProblemAsync(HttpStatusCode.BadRequest, "nameTooLong");

        problem.ShouldHaveError("name", "nameTooLong");
    }

    [Fact]
    [Trait("Case", "DRUG-021")]
    public async Task The_length_limit_applies_after_trimming()
    {
        var owner = await OwnerAsync();
        var name = new string('x', 256);

        var created = await CreateDrugAsync(owner, $" {name} ");

        created.Name.ShouldBe(name);
    }

    [Fact]
    [Trait("Case", "DRUG-022")]
    public async Task A_name_with_a_NUL_is_400_nameInvalid()
    {
        var owner = await OwnerAsync();

        var problem = await (await PostDrugAsync(owner, "Tobra\0dex")).ShouldBeProblemAsync(HttpStatusCode.BadRequest, "nameInvalid");

        problem.ShouldHaveError("name", "nameInvalid");
    }

    [Theory]
    [Trait("Case", "DRUG-023")]
    [InlineData("Tobra\ndex")]
    [InlineData("Tobra\r\ndex")]
    [InlineData("Tobra\tdex")]
    public async Task A_name_with_a_line_break_or_a_tab_inside_is_400_nameInvalid(string name)
    {
        var owner = await OwnerAsync();

        await (await PostDrugAsync(owner, name)).ShouldBeProblemAsync(HttpStatusCode.BadRequest, "nameInvalid");
    }

    [Theory]
    [Trait("Case", "DRUG-024")]
    [InlineData("Tobra\u2028dex")]
    [InlineData("Tobra\u2029dex")]
    public async Task A_name_with_a_line_or_paragraph_separator_is_400_nameInvalid(string name)
    {
        var owner = await OwnerAsync();

        await (await PostDrugAsync(owner, name)).ShouldBeProblemAsync(HttpStatusCode.BadRequest, "nameInvalid");
    }

    [Theory]
    [Trait("Case", "DRUG-025")]
    [InlineData("Tobra\u202Adex")]
    [InlineData("Tobra\u202Edex")]
    [InlineData("Tobra\u2066dex")]
    [InlineData("Tobra\u2069dex")]
    public async Task A_name_with_a_bidi_override_or_isolate_is_400_nameInvalid(string name)
    {
        var owner = await OwnerAsync();

        await (await PostDrugAsync(owner, name)).ShouldBeProblemAsync(HttpStatusCode.BadRequest, "nameInvalid");
    }

    [Theory]
    [Trait("Case", "DRUG-026")]
    [InlineData("قطرة\u200Dمرطبة")]
    [InlineData("قطرة\u200Cمرطبة")]
    [InlineData("\u200Fقطرة مرطبة")]
    [InlineData("Tobradex\u200E")]
    [InlineData("\u061Cقطرة مرطبة")]
    public async Task A_name_with_joiners_or_plain_direction_marks_is_accepted(string name)
    {
        var owner = await OwnerAsync();

        var created = await CreateDrugAsync(owner, name);

        created.Name.ShouldBe(name);
    }

    [Theory]
    [Trait("Case", "DRUG-027")]
    [InlineData("Vigamox فيجاموكس")]
    [InlineData("Eye drops 👁️ قطرة")]
    public async Task A_name_with_an_emoji_or_mixed_scripts_is_stored_as_typed(string name)
    {
        var owner = await OwnerAsync();

        var created = await CreateDrugAsync(owner, name);

        (await GetDrugAsync(owner, created.Id)).Name.ShouldBe(name);
    }

    [Fact]
    [Trait("Case", "DRUG-028")]
    public async Task A_too_long_name_with_a_NUL_reports_nameInvalid_then_nameTooLong()
    {
        var owner = await OwnerAsync();
        var name = new string('x', 128) + "\0" + new string('x', 128);

        var problem = await (await PostDrugAsync(owner, name)).ShouldBeProblemAsync(HttpStatusCode.BadRequest, "nameInvalid");

        name.Length.ShouldBe(257);
        problem.Codes.ShouldBe(["nameInvalid", "nameTooLong"]);
    }

    [Fact]
    [Trait("Case", "DRUG-029")]
    public async Task A_description_with_a_NUL_is_400_invalidText_on_description()
    {
        var owner = await OwnerAsync();

        var problem = await (await PostDrugAsync(owner, "Tobradex", "bad\0text"))
            .ShouldBeProblemAsync(HttpStatusCode.BadRequest, "invalidText");

        problem.ShouldHaveError("description", "invalidText");
    }

    [Fact]
    [Trait("Case", "DRUG-030")]
    public async Task Every_failing_rule_is_reported_in_order()
    {
        var owner = await OwnerAsync();

        var problem = await (await PostDrugAsync(owner, "", "bad\0text", new { doseAmount = 1 }))
            .ShouldBeProblemAsync(HttpStatusCode.BadRequest, "nameRequired");

        problem.Codes.ShouldBe(["nameRequired", "invalidText", "invalidDosing"]);
        problem.ShouldHaveError("name", "nameRequired");
        problem.ShouldHaveError("description", "invalidText");
        problem.ShouldHaveError("defaultDosing", "invalidDosing");
    }
}
