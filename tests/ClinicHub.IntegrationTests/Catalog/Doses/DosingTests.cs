using System.Net;
using ClinicHub.Application.Features.Catalog.Drugs;
using ClinicHub.IntegrationTests.Harness.Assertions;
using ClinicHub.IntegrationTests.Harness.Hosting;
using Shouldly;

namespace ClinicHub.IntegrationTests.Catalog.Doses;

/// <summary>
/// The structured dosing rules as the API applies them to a drug's default dosing and a protocol line's override
/// (dosing § القواعد and § الحقول; dosing tech § Data model and § Backend).
/// </summary>
[Collection(CatalogDosingCollection.Name)]
[Trait("Area", "catalog")]
public class DosingTests(AppFixture app) : CatalogTest(app)
{
    [Theory]
    [Trait("Case", "DOSE-043")]
    [InlineData("0")]
    [InlineData("-1")]
    public async Task A_dose_amount_of_zero_or_less_is_invalid(string amount) =>
        await ShouldBeRejectedAsync(new { doseAmount = decimal.Parse(amount), doseUnit = "drop" });

    [Theory]
    [Trait("Case", "DOSE-044")]
    [InlineData("0.001")]
    [InlineData("0.5")]
    [InlineData("1000")]
    public async Task A_dose_amount_above_zero_up_to_1000_is_valid(string amount)
    {
        var drug = await ShouldBeAcceptedAsync(new { doseAmount = decimal.Parse(amount), doseUnit = "tablet" });

        drug.DefaultDosing.DoseAmount.ShouldBe(decimal.Parse(amount));
        drug.DefaultDosing.DoseUnit.ShouldBe("tablet");
    }

    [Theory]
    [Trait("Case", "DOSE-045")]
    [InlineData("1000.5")]
    [InlineData("1001")]
    [InlineData("1000.0001")]
    public async Task A_dose_amount_above_1000_is_invalid(string amount) =>
        await ShouldBeRejectedAsync(new { doseAmount = decimal.Parse(amount), doseUnit = "drop" });

    [Fact]
    [Trait("Case", "DOSE-046")]
    public async Task A_dose_amount_without_a_unit_is_invalid() =>
        await ShouldBeRejectedAsync(new { doseAmount = 2, frequency = "daily", frequencyValue = 3 });

    [Fact]
    [Trait("Case", "DOSE-047")]
    public async Task A_unit_without_an_amount_is_valid()
    {
        var drug = await ShouldBeAcceptedAsync(new { doseUnit = "drop" });

        drug.DefaultDosing.DoseUnit.ShouldBe("drop");
        drug.DefaultDosing.DoseAmount.ShouldBeNull();
    }

    [Theory]
    [Trait("Tier", "Smoke")]
    [Trait("Case", "DOSE-048")]
    [InlineData(0, false)]
    [InlineData(1, true)]
    [InlineData(24, true)]
    [InlineData(25, false)]
    public async Task Daily_takes_1_to_24_times(int times, bool valid) =>
        await ShouldBeAsync(valid, new { frequency = "daily", frequencyValue = times });

    [Fact]
    [Trait("Case", "DOSE-049")]
    public async Task Daily_without_a_number_is_invalid() => await ShouldBeRejectedAsync(new { frequency = "daily" });

    [Theory]
    [Trait("Case", "DOSE-050")]
    [InlineData(0, false)]
    [InlineData(1, true)]
    [InlineData(72, true)]
    [InlineData(73, false)]
    [InlineData(null, false)]
    public async Task Every_hours_takes_1_to_72_hours(int? hours, bool valid) =>
        await ShouldBeAsync(valid, new { frequency = "everyHours", frequencyValue = hours });

    [Theory]
    [Trait("Case", "DOSE-051")]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   ")]
    public async Task A_custom_frequency_needs_a_text(string text) =>
        await ShouldBeRejectedAsync(new { frequency = "custom", frequencyText = text });

    [Fact]
    [Trait("Case", "DOSE-052")]
    public async Task A_custom_text_may_hold_200_characters_after_trimming_not_201()
    {
        var text = "ق" + new string('x', 198) + "Z";

        var drug = await ShouldBeAcceptedAsync(new { frequency = "custom", frequencyText = $"  {text}  " });
        await ShouldBeRejectedAsync(new { frequency = "custom", frequencyText = text + "x" });

        text.Length.ShouldBe(200);
        drug.DefaultDosing.FrequencyText.ShouldBe(text);
    }

    [Fact]
    [Trait("Case", "DOSE-054")]
    public async Task A_custom_text_with_a_NUL_is_invalid() =>
        await ShouldBeRejectedAsync(new { frequency = "custom", frequencyText = "after\0meals" });

    [Theory]
    [Trait("Case", "DOSE-055")]
    [InlineData("days")]
    [InlineData("weeks")]
    [InlineData("months")]
    public async Task A_period_takes_1_to_365_and_needs_its_number(string unit)
    {
        await ShouldBeRejectedAsync(new { durationUnit = unit, durationValue = 0 });
        await ShouldBeAcceptedAsync(new { durationUnit = unit, durationValue = 1 });
        await ShouldBeAcceptedAsync(new { durationUnit = unit, durationValue = 365 });
        await ShouldBeRejectedAsync(new { durationUnit = unit, durationValue = 366 });
        await ShouldBeRejectedAsync(new { durationUnit = unit });
    }

    [Fact]
    [Trait("Case", "DOSE-056")]
    public async Task Unknown_codes_are_invalid()
    {
        await ShouldBeRejectedAsync(new { doseAmount = 1, doseUnit = "spoon" });
        await ShouldBeRejectedAsync(new { frequency = "weekly", frequencyValue = 1 });
        await ShouldBeRejectedAsync(new { durationUnit = "years", durationValue = 1 });
        await ShouldBeRejectedAsync(new { eye = "top" });
    }

    [Fact]
    [Trait("Case", "DOSE-057")]
    public async Task Codes_are_exact_case()
    {
        await ShouldBeRejectedAsync(new { doseAmount = 1, doseUnit = "Drop" });
        await ShouldBeRejectedAsync(new { frequency = "Daily", frequencyValue = 2 });
        await ShouldBeRejectedAsync(new { durationUnit = "Weeks", durationValue = 1 });
        await ShouldBeRejectedAsync(new { eye = "Right" });
    }

    [Fact]
    [Trait("Case", "DOSE-058")]
    public async Task Eye_ask_is_refused_on_a_drug_default_and_accepted_on_a_protocol_line()
    {
        var owner = await OwnerAsync();
        await ShouldBeRejectedAsync(new { eye = "ask" });
        var drug = await CreateDrugAsync(owner, "Tobradex");

        var protocol = await CreateProtocolAsync(owner, "Post cataract", Item(drug.Id, new { eye = "ask" }));

        protocol.Items.ShouldHaveSingleItem().Dosing.Eye.ShouldBe("ask");
        var problem = await (await PutDrugAsync(owner, drug.Id, "Tobradex", defaultDosing: new { eye = "ask" }))
            .ShouldBeProblemAsync(HttpStatusCode.BadRequest, "invalidDosing");
        problem.ShouldHaveError("defaultDosing", "invalidDosing");
    }

    [Fact]
    [Trait("Case", "DOSE-059")]
    public async Task An_empty_dosing_is_valid_and_saved_as_null_on_a_protocol_line_too()
    {
        var owner = await OwnerAsync();
        var drug = await CreateDrugAsync(owner, "Tobradex", defaultDosing: new { });

        var protocol = await CreateProtocolAsync(owner, "Empty override", Item(drug.Id, new { eye = "", frequency = " " }));

        drug.DefaultDosing.ShouldBeNull();
        protocol.Items.ShouldHaveSingleItem().Dosing.ShouldBeNull();
    }

    [Fact]
    [Trait("Case", "DOSE-060")]
    public async Task An_invalid_dosing_reaching_the_API_is_answered_invalidDosing()
    {
        var owner = await OwnerAsync();
        var drug = await CreateDrugAsync(owner, "Tobradex", defaultDosing: new { doseAmount = 1, doseUnit = "drop" });

        // A stale form: a dosing the SPA's own checks would have stopped
        var onDrug = await PutDrugAsync(owner, drug.Id, "Tobradex", defaultDosing: new { doseAmount = 1, frequency = "daily" });
        var onProtocol = await PostProtocolAsync(owner, "Stale", Item(drug.Id, new { durationUnit = "days" }));

        (await onDrug.ShouldBeProblemAsync(HttpStatusCode.BadRequest, "invalidDosing")).ShouldHaveError("defaultDosing", "invalidDosing");
        (await onProtocol.ShouldBeProblemAsync(HttpStatusCode.BadRequest, "invalidDosing")).ShouldHaveError("items[0].dosing", "invalidDosing");
    }

    // ---- Helpers ----

    private async Task<DrugDto> ShouldBeAcceptedAsync(object dosing)
    {
        var owner = await OwnerAsync();
        var drug = await CreateDrugAsync(owner, "Dosed", defaultDosing: dosing);
        drug.DefaultDosing.ShouldNotBeNull();
        return drug;
    }

    private async Task ShouldBeRejectedAsync(object dosing)
    {
        var owner = await OwnerAsync();
        var problem = await (await PostDrugAsync(owner, "Dosed", defaultDosing: dosing))
            .ShouldBeProblemAsync(HttpStatusCode.BadRequest, "invalidDosing");
        problem.ShouldHaveError("defaultDosing", "invalidDosing");
    }

    private Task ShouldBeAsync(bool valid, object dosing) => valid ? ShouldBeAcceptedAsync(dosing) : ShouldBeRejectedAsync(dosing);
}
