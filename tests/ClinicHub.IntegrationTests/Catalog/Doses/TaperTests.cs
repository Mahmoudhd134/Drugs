using System.Net;
using ClinicHub.Application.Features.Catalog.Drugs;
using ClinicHub.Domain.Catalog;
using ClinicHub.IntegrationTests.Harness.Assertions;
using ClinicHub.IntegrationTests.Harness.Hosting;
using Shouldly;

namespace ClinicHub.IntegrationTests.Catalog.Doses;

/// <summary>
/// Tapering schedules through the drug and group APIs: storage, normalization and the step rules
/// (tapering § القواعد; tapering tech § API and § Backend).
/// </summary>
[Collection(CatalogDosingCollection.Name)]
[Trait("Area", "catalog")]
public class TaperTests(AppFixture app) : CatalogTest(app)
{
    [Fact]
    [Trait("Tier", "Smoke")]
    [Trait("Case", "TAPER-001")]
    public async Task A_two_step_taper_is_stored_and_read_back_as_sent()
    {
        var owner = await OwnerAsync();
        var dosing = new Dosing
        {
            DoseAmount = 2, DoseUnit = "drop", Eye = "right",
            TaperSteps = [Daily(4, weeks: 1), Step("everyHours", 12, "days", 5, doseAmount: 1)],
        };

        var created = await CreateDrugAsync(owner, "Pred Forte", defaultDosing: dosing);
        var read = await GetDrugAsync(owner, created.Id);
        var put = await PutDrugAsync(owner, created.Id, "Pred Forte", defaultDosing: dosing);
        await put.ShouldBeOkAsync();
        var updated = await put.ReadAsync<DrugDto>();

        foreach (var answered in new[] { created.DefaultDosing, read.DefaultDosing, updated.DefaultDosing })
        {
            ShouldMatch(answered, dosing);
            answered.Frequency.ShouldBeNull();
            answered.DurationUnit.ShouldBeNull();
        }
    }

    [Fact]
    [Trait("Case", "TAPER-002")]
    public async Task Ten_steps_are_accepted()
    {
        var steps = Enumerable.Range(0, 10).Select(i => Daily(10 - i)).ToArray();

        var drug = await AcceptedAsync(Taper(steps));

        drug.DefaultDosing.TaperSteps.Select(s => s.FrequencyValue).ShouldBe([10, 9, 8, 7, 6, 5, 4, 3, 2, 1]);
    }

    [Fact]
    [Trait("Case", "TAPER-003")]
    public async Task Eleven_steps_are_invalidDosing() =>
        await RejectedAsync(Taper([.. Enumerable.Range(0, 11).Select(i => Daily(11 - i))]));

    [Fact]
    [Trait("Tier", "Smoke")]
    [Trait("Case", "TAPER-004")]
    public async Task A_one_step_schedule_is_stored_as_a_plain_dosing()
    {
        var owner = await OwnerAsync();
        var created = await CreateDrugAsync(owner, "One step", defaultDosing: Taper(Daily(4, weeks: 1)));

        var read = await GetDrugAsync(owner, created.Id);

        var plain = new Dosing
        {
            DoseAmount = 1, DoseUnit = "drop", Frequency = "daily", FrequencyValue = 4, DurationUnit = "weeks", DurationValue = 1,
        };
        ShouldMatch(created.DefaultDosing, plain);
        ShouldMatch(read.DefaultDosing, plain);
    }

    [Fact]
    [Trait("Case", "TAPER-006")]
    public async Task An_empty_step_list_is_no_schedule()
    {
        var dosing = new Dosing
        {
            DoseAmount = 1, DoseUnit = "drop", Frequency = "daily", FrequencyValue = 3, DurationUnit = "days", DurationValue = 7,
            TaperSteps = [],
        };

        var drug = await AcceptedAsync(dosing);

        ShouldMatch(drug.DefaultDosing, new Dosing
        {
            DoseAmount = 1, DoseUnit = "drop", Frequency = "daily", FrequencyValue = 3, DurationUnit = "days", DurationValue = 7,
        });
    }

    [Fact]
    [Trait("Case", "TAPER-007")]
    public async Task Steps_win_over_a_dosing_level_frequency_and_duration()
    {
        var dosing = Taper(Daily(4), Daily(2));
        dosing.Frequency = "everyHours";
        dosing.FrequencyValue = 6;
        dosing.DurationUnit = "days";
        dosing.DurationValue = 10;

        var drug = await AcceptedAsync(dosing);

        ShouldMatch(drug.DefaultDosing, Taper(Daily(4), Daily(2)));
    }

    [Theory]
    [Trait("Case", "TAPER-008")]
    [InlineData("bedtime", 0)]
    [InlineData("asNeeded", 0)]
    [InlineData("custom", 0)]
    [InlineData(null, 0)]
    [InlineData("bedtime", 1)]
    [InlineData("asNeeded", 1)]
    [InlineData("custom", 1)]
    [InlineData(null, 1)]
    public async Task A_step_needs_times_a_day_or_every_hours(string frequency, int stepIndex)
    {
        var steps = new[] { Daily(4), Daily(2), Daily(1) };
        steps[stepIndex] = Step(frequency, 2, "weeks", 1);

        await RejectedAsync(Taper(steps));
    }

    [Theory]
    [Trait("Case", "TAPER-009")]
    [InlineData("daily", 0, false)]
    [InlineData("daily", 1, true)]
    [InlineData("daily", 24, true)]
    [InlineData("daily", 25, false)]
    [InlineData("everyHours", 0, false)]
    [InlineData("everyHours", 1, true)]
    [InlineData("everyHours", 72, true)]
    [InlineData("everyHours", 73, false)]
    [InlineData("daily", null, false)]
    [InlineData("everyHours", null, false)]
    public async Task A_step_frequency_value_has_the_dosing_limits(string frequency, int? value, bool valid) =>
        await ExpectAsync(valid, Taper(Daily(4), Step(frequency, value, "weeks", 1)));

    [Theory]
    [Trait("Case", "TAPER-010")]
    [InlineData(0)]
    [InlineData(1)]
    [InlineData(2)]
    public async Task A_step_in_months_is_invalid_on_any_step(int stepIndex)
    {
        var steps = new[] { Daily(3), Daily(2), Daily(1) };
        steps[stepIndex] = Step("daily", 2, "months", 1);

        await RejectedAsync(Taper(steps));
    }

    [Theory]
    [Trait("Case", "TAPER-011")]
    [InlineData("days", 0, false)]
    [InlineData("days", 1, true)]
    [InlineData("days", 365, true)]
    [InlineData("days", 366, false)]
    [InlineData("days", null, false)]
    [InlineData("weeks", 0, false)]
    [InlineData("weeks", 1, true)]
    [InlineData("weeks", 365, true)]
    [InlineData("weeks", 366, false)]
    [InlineData("weeks", null, false)]
    public async Task A_step_period_takes_1_to_365(string unit, int? value, bool valid)
    {
        await ExpectAsync(valid, Taper(Step("daily", 4, unit, value), Daily(2)));
        await ExpectAsync(valid, Taper(Daily(4), Step("daily", 2, unit, value)));
    }

    [Fact]
    [Trait("Case", "TAPER-012")]
    public async Task A_step_without_a_period_is_invalid()
    {
        await RejectedAsync(Taper(Step("daily", 4, null, null), Daily(2)));
        await RejectedAsync(Taper(Daily(4), Step("daily", 2, null, null)));
        await RejectedAsync(Taper(Daily(4), Step("daily", 2, null, 3)));
    }

    [Theory]
    [Trait("Case", "TAPER-013")]
    [InlineData("continuous")]
    [InlineData("untilNextVisit")]
    public async Task The_last_step_may_be_open_ended(string unit)
    {
        var drug = await AcceptedAsync(Taper(Daily(4), Daily(3), Step("daily", 1, unit, null)));

        drug.DefaultDosing.TaperSteps[^1].DurationUnit.ShouldBe(unit);
    }

    [Theory]
    [Trait("Case", "TAPER-014")]
    [InlineData("continuous", 0)]
    [InlineData("untilNextVisit", 0)]
    [InlineData("continuous", 1)]
    [InlineData("untilNextVisit", 1)]
    public async Task An_open_ended_step_before_the_last_is_invalid(string unit, int stepIndex)
    {
        var steps = new[] { Daily(4), Daily(3), Daily(1) };
        steps[stepIndex] = Step("daily", 2, unit, null);

        await RejectedAsync(Taper(steps));
    }

    [Theory]
    [Trait("Case", "TAPER-015")]
    [InlineData("0", false)]
    [InlineData("-1", false)]
    [InlineData("1000.5", false)]
    [InlineData("0.5", true)]
    [InlineData("1000", true)]
    public async Task A_step_dose_is_above_zero_up_to_1000(string dose, bool valid)
    {
        var amount = decimal.Parse(dose);

        await ExpectAsync(valid, Taper(Daily(4), Daily(2, doseAmount: amount)));
        // Step 1's dose becomes the dosing's dose: the same limits
        await ExpectAsync(valid, Taper(Daily(4, doseAmount: amount), Daily(2)));
    }

    [Fact]
    [Trait("Case", "TAPER-016")]
    public async Task Step_doses_without_a_unit_are_accepted_on_a_group_line_and_on_a_drug_default()
    {
        var owner = await OwnerAsync();
        var drug = await CreateDrugAsync(owner, "Pred Forte", defaultDosing: new { doseAmount = 1, doseUnit = "drop" });
        var unitless = new Dosing { TaperSteps = [Daily(4), Daily(3, doseAmount: 2), Daily(1, doseAmount: 0.5m)] };

        var group = await CreateGroupAsync(owner, "Taper", Item(drug.Id, unitless));
        var other = await CreateDrugAsync(owner, "Unitless steps", defaultDosing: unitless);

        ShouldMatch(group.Items.ShouldHaveSingleItem().Dosing, unitless);
        ShouldMatch(other.DefaultDosing, unitless);
    }

    [Fact]
    [Trait("Case", "TAPER-017")]
    public async Task The_first_step_dose_becomes_the_dosing_dose()
    {
        var dosing = Taper(Daily(4, doseAmount: 2), Daily(2));

        var drug = await AcceptedAsync(dosing);

        drug.DefaultDosing.DoseAmount.ShouldBe(2m);
        drug.DefaultDosing.TaperSteps[0].DoseAmount.ShouldBeNull();
    }

    [Fact]
    [Trait("Case", "TAPER-018")]
    public async Task A_later_step_dose_equal_to_the_dosing_dose_is_cleared()
    {
        var dosing = Taper(Daily(4), Daily(3, doseAmount: 1), Daily(2, doseAmount: 2), Daily(1, doseAmount: 1.0m));

        var drug = await AcceptedAsync(dosing);

        drug.DefaultDosing.DoseAmount.ShouldBe(1m);
        drug.DefaultDosing.TaperSteps.Select(s => s.DoseAmount).ShouldBe([null, null, 2m, null]);
    }

    [Fact]
    [Trait("Case", "TAPER-023")]
    public async Task Saving_a_drug_again_without_steps_removes_its_taper()
    {
        var owner = await OwnerAsync();
        var created = await CreateDrugAsync(owner, "Tapered", defaultDosing: Taper(Daily(4), Daily(2)));
        var plain = new Dosing
        {
            DoseAmount = 1, DoseUnit = "drop", Frequency = "daily", FrequencyValue = 2, DurationUnit = "weeks", DurationValue = 2,
        };

        await (await PutDrugAsync(owner, created.Id, "Tapered", defaultDosing: plain)).ShouldBeOkAsync();

        ShouldMatch((await GetDrugAsync(owner, created.Id)).DefaultDosing, plain);
    }

    // ---- Helpers ----

    private async Task<DrugDto> AcceptedAsync(Dosing dosing)
    {
        var owner = await OwnerAsync();
        return await CreateDrugAsync(owner, "Tapered", defaultDosing: dosing);
    }

    private async Task RejectedAsync(Dosing dosing)
    {
        var owner = await OwnerAsync();
        var problem = await (await PostDrugAsync(owner, "Tapered", defaultDosing: dosing))
            .ShouldBeProblemAsync(HttpStatusCode.BadRequest, "invalidDosing");
        problem.ShouldHaveError("defaultDosing", "invalidDosing");
    }

    private Task ExpectAsync(bool valid, Dosing dosing) => valid ? AcceptedAsync(dosing) : RejectedAsync(dosing);
}
