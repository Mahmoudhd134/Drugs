using ClinicHub.Domain.Catalog;
using Shouldly;

namespace ClinicHub.UnitTests.Catalog.Tapering;

/// <summary>
/// Taper schedule limits (tapering business § القواعد, tapering tech § Backend), checked the way the validators run
/// them: <c>IsValid(Normalize(dosing))</c>.
/// </summary>
[Trait("Area", "catalog")]
public class TaperValidityTests
{
    private static bool Accepted(Dosing dosing, bool groupLine = false) =>
        DosingRules.IsValid(DosingRules.Normalize(dosing), allowAskEye: groupLine);

    private static TaperStep Step(string frequency, int? value, string unit, int? duration = null, decimal? dose = null) =>
        new() { DoseAmount = dose, Frequency = frequency, FrequencyValue = value, DurationUnit = unit, DurationValue = duration };

    private static TaperStep Daily(int times, string unit = "weeks", int? duration = 1) => Step("daily", times, unit, duration);

    private static Dosing Taper(params TaperStep[] steps) =>
        new() { DoseAmount = 1, DoseUnit = "drop", TaperSteps = [.. steps] };

    [Theory]
    [Trait("Case", "TAPER-002")]
    [Trait("Case", "TAPER-003")]
    [Trait("Tier", "Smoke")]
    [InlineData(2, true)]
    [InlineData(9, true)]
    [InlineData(10, true)]
    [InlineData(11, false)]
    [InlineData(12, false)]
    public void A_schedule_has_at_most_10_steps(int count, bool valid)
    {
        var steps = Enumerable.Range(0, count).Select(i => Step("daily", 12 - i, "days", 3)).ToArray();

        Accepted(Taper(steps)).ShouldBe(valid, $"{count} steps");
        Accepted(Taper(steps), groupLine: true).ShouldBe(valid, $"{count} steps on a protocol line");
    }

    [Theory]
    [Trait("Case", "TAPER-008")]
    [InlineData("bedtime")]
    [InlineData("asNeeded")]
    [InlineData("custom")]
    [InlineData(null)]
    [InlineData("weekly")]
    public void A_step_needs_times_a_day_or_every_hours(string frequency)
    {
        Accepted(Taper(Daily(4), Step(frequency, null, "weeks", 1))).ShouldBeFalse($"step 2 frequency {frequency ?? "none"}");
        Accepted(Taper(Step(frequency, null, "weeks", 1), Daily(3))).ShouldBeFalse($"step 1 frequency {frequency ?? "none"}");
    }

    [Theory]
    [Trait("Case", "TAPER-009")]
    [InlineData("daily", 0, false)]
    [InlineData("daily", 1, true)]
    [InlineData("daily", 24, true)]
    [InlineData("daily", 25, false)]
    [InlineData("daily", null, false)]
    [InlineData("everyHours", 0, false)]
    [InlineData("everyHours", 1, true)]
    [InlineData("everyHours", 72, true)]
    [InlineData("everyHours", 73, false)]
    [InlineData("everyHours", null, false)]
    public void A_step_frequency_has_the_dosing_limits(string frequency, int? value, bool valid)
    {
        Accepted(Taper(Daily(4), Step(frequency, value, "weeks", 1))).ShouldBe(valid, $"step {frequency} {value}");
    }

    [Fact]
    [Trait("Case", "TAPER-010")]
    public void A_step_in_months_is_invalid_even_the_last()
    {
        Accepted(Taper(Daily(4, "months", 1), Daily(3))).ShouldBeFalse("first step in months");
        Accepted(Taper(Daily(4), Daily(3, "months", 1))).ShouldBeFalse("last step in months");
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
    public void A_step_period_needs_1_to_365(string unit, int? value, bool valid)
    {
        Accepted(Taper(Daily(4, unit, value), Daily(3))).ShouldBe(valid, $"step 1: {value} {unit}");
        Accepted(Taper(Daily(4), Daily(3, unit, value))).ShouldBe(valid, $"last step: {value} {unit}");
    }

    [Theory]
    [Trait("Case", "TAPER-012")]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("years")]
    public void A_step_needs_a_period(string unit)
    {
        Accepted(Taper(Daily(4), Daily(3, unit, 1))).ShouldBeFalse();
        Accepted(Taper(Daily(4, unit, 1), Daily(3))).ShouldBeFalse();
    }

    [Theory]
    [Trait("Case", "TAPER-013")]
    [Trait("Tier", "Smoke")]
    [InlineData("continuous")]
    [InlineData("untilNextVisit")]
    public void The_last_step_may_be_open_ended(string unit)
    {
        Accepted(Taper(Daily(4), Daily(1, unit, null))).ShouldBeTrue();
        Accepted(Taper(Daily(4), Daily(3), Daily(1, unit, null))).ShouldBeTrue("last of three");
    }

    [Theory]
    [Trait("Case", "TAPER-014")]
    [InlineData("continuous")]
    [InlineData("untilNextVisit")]
    public void Only_the_last_step_may_be_open_ended(string unit)
    {
        Accepted(Taper(Daily(4, unit, null), Daily(3))).ShouldBeFalse("first of two");
        Accepted(Taper(Daily(4), Daily(3, unit, null), Daily(2))).ShouldBeFalse("middle of three");
        Accepted(Taper(Daily(4, unit, null), Daily(3, unit, null))).ShouldBeFalse("both open-ended");
    }

    [Theory]
    [Trait("Case", "TAPER-015")]
    [InlineData(0, false)]
    [InlineData(-1, false)]
    [InlineData(1000.5, false)]
    [InlineData(0.5, true)]
    [InlineData(1000, true)]
    public void A_step_dose_must_be_above_0_and_at_most_1000(double dose, bool valid)
    {
        var laterStep = Step("daily", 3, "weeks", 1, (decimal)dose);
        Accepted(Taper(Daily(4), laterStep)).ShouldBe(valid, $"step 2 dose {dose}");

        // The first step's dose becomes the dosing's dose, so the same limits apply to it
        var firstStep = Step("daily", 4, "weeks", 1, (decimal)dose);
        Accepted(Taper(firstStep, Daily(3))).ShouldBe(valid, $"step 1 dose {dose}");
    }

    [Fact]
    public void A_later_step_dose_needs_no_unit_on_the_dosing()
    {
        // tapering tech § Backend: "A step dose does not require the dosing's own unit, because a protocol line may
        // inherit the unit from the drug" (catalog TAPER-016 at the API level)
        var dosing = new Dosing { Eye = "ask", TaperSteps = [Daily(4), Step("daily", 3, "weeks", 1, 2)] };

        Accepted(dosing, groupLine: true).ShouldBeTrue();
        Accepted(new Dosing { TaperSteps = [Daily(4), Step("daily", 3, "weeks", 1, 2)] }).ShouldBeTrue("drug default too");
    }

    [Fact]
    [Trait("Case", "TAPER-080")]
    public void A_first_step_dose_without_a_unit_is_invalid_on_a_drug_default_and_a_protocol_line()
    {
        // tapering tech § Backend: "Step 1's dose becomes the dosing's dose (above), so it needs the unit like any dose
        // (invalidDosing without it)"; unlike a later step's dose (TAPER-016), a protocol line can't inherit it
        var noUnit = new Dosing { TaperSteps = [Step("daily", 4, "weeks", 1, 2), Daily(3)] };
        var askEye = new Dosing { Eye = "ask", TaperSteps = [Step("daily", 4, "weeks", 1, 2), Daily(3)] };

        Accepted(noUnit).ShouldBeFalse("drug default");
        Accepted(noUnit, groupLine: true).ShouldBeFalse("protocol line");
        Accepted(askEye, groupLine: true).ShouldBeFalse("protocol line with the ask eye");

        // The same schedule with the unit is accepted
        var withUnit = new Dosing { DoseUnit = "drop", TaperSteps = [Step("daily", 4, "weeks", 1, 2), Daily(3)] };
        Accepted(withUnit).ShouldBeTrue("drug default with the unit");
        Accepted(withUnit, groupLine: true).ShouldBeTrue("protocol line with the unit");
    }

    [Fact]
    [Trait("Case", "TAPER-007")]
    public void Steps_with_a_dosing_frequency_and_duration_are_accepted_once_normalized()
    {
        var dosing = Taper(Daily(4), Daily(3));
        dosing.Frequency = "daily";
        dosing.FrequencyValue = 3;
        dosing.DurationUnit = "days";
        dosing.DurationValue = 5;

        Accepted(dosing).ShouldBeTrue();
    }

    [Fact]
    public void Steps_next_to_a_dosing_frequency_or_duration_are_invalid_before_normalizing()
    {
        // tapering tech § Backend, IsValid: "no dosing-level frequency/duration next to steps"
        DosingRules.IsValid(new Dosing { Frequency = "daily", FrequencyValue = 2, TaperSteps = [Daily(4), Daily(3)] })
            .ShouldBeFalse();
        DosingRules.IsValid(new Dosing { DurationUnit = "continuous", TaperSteps = [Daily(4), Daily(3)] }).ShouldBeFalse();
        DosingRules.IsValid(new Dosing { TaperSteps = [Daily(4), Daily(3)] }).ShouldBeTrue();
    }

    [Fact]
    public void A_single_or_empty_step_list_is_invalid_before_normalizing()
    {
        // IsValid: 2-10 steps (Normalize folds one step into a plain dosing and an empty list into none)
        DosingRules.IsValid(new Dosing { TaperSteps = [Daily(4)] }).ShouldBeFalse();
        DosingRules.IsValid(new Dosing { TaperSteps = [] }).ShouldBeFalse();
    }

    [Fact]
    [Trait("Case", "TAPER-006")]
    public void An_empty_step_list_is_accepted_as_no_schedule()
    {
        Accepted(new Dosing { TaperSteps = [] }).ShouldBeTrue();
        Accepted(new Dosing { Frequency = "daily", FrequencyValue = 2, TaperSteps = [] }).ShouldBeTrue();
    }

    [Fact]
    [Trait("Case", "TAPER-004")]
    public void A_one_step_schedule_is_accepted_as_a_plain_dosing()
    {
        Accepted(Taper(Daily(4))).ShouldBeTrue();
    }

    [Fact]
    public void A_one_step_schedule_follows_the_plain_dosing_limits()
    {
        Accepted(Taper(Daily(25))).ShouldBeFalse("daily 25");
        Accepted(Taper(Daily(4, "days", 366))).ShouldBeFalse("366 days");
    }

    [Fact]
    public void Eye_ask_with_a_schedule_is_only_valid_on_a_protocol_line()
    {
        var dosing = Taper(Daily(2, "days", 7), Daily(1, "untilNextVisit", null));
        dosing.Eye = "ask";

        Accepted(dosing).ShouldBeFalse();
        Accepted(dosing, groupLine: true).ShouldBeTrue();
    }

    [Fact]
    public void Taper_limits_match_the_documented_switches()
    {
        // tapering tech § Backend: limits mirrored in taperConfig.ts
        DosingRules.MaxTaperSteps.ShouldBe(10);
        DosingRules.TaperFrequencies.ShouldBe(["daily", "everyHours"]);
        DosingRules.TaperDurationUnits.ShouldBe(["days", "weeks"]);
        DosingRules.TaperLastDurationUnits.ShouldBe(["days", "weeks", "continuous", "untilNextVisit"]);
        DosingRules.MaxFrequencyTextLength.ShouldBe(200);
    }
}
