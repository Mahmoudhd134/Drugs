using ClinicHub.Domain.Catalog;
using Shouldly;

namespace ClinicHub.UnitTests.Catalog.Tapering;

/// <summary><c>DosingRules.Normalize</c> with a taper schedule (tapering tech § Backend).</summary>
[Trait("Area", "catalog")]
public class TaperNormalizeTests
{
    private static TaperStep Step(string frequency, int? value, string unit, int? duration = null, decimal? dose = null) =>
        new() { DoseAmount = dose, Frequency = frequency, FrequencyValue = value, DurationUnit = unit, DurationValue = duration };

    private static void ShouldBeStep(TaperStep step, string frequency, int? value, string unit, int? duration,
        decimal? dose = null)
    {
        step.ShouldSatisfyAllConditions(
            () => step.Frequency.ShouldBe(frequency),
            () => step.FrequencyValue.ShouldBe(value),
            () => step.DurationUnit.ShouldBe(unit),
            () => step.DurationValue.ShouldBe(duration),
            () => step.DoseAmount.ShouldBe(dose));
    }

    [Fact]
    [Trait("Case", "TAPER-002")]
    public void Ten_steps_are_kept_in_order()
    {
        var steps = Enumerable.Range(0, 10).Select(i => Step("daily", 10 - i, "days", 3)).ToList();

        var normalized = DosingRules.Normalize(new Dosing { DoseUnit = "drop", TaperSteps = steps });

        normalized.TaperSteps.Count.ShouldBe(10);
        normalized.TaperSteps.Select(s => s.FrequencyValue).ShouldBe([10, 9, 8, 7, 6, 5, 4, 3, 2, 1]);
    }

    [Fact]
    [Trait("Case", "TAPER-004")]
    [Trait("Tier", "Smoke")]
    public void One_step_becomes_a_plain_dosing()
    {
        var normalized = DosingRules.Normalize(new Dosing
            { DoseAmount = 2, DoseUnit = "drop", TaperSteps = [Step("daily", 4, "weeks", 1)] });

        normalized.ShouldSatisfyAllConditions(
            () => normalized.TaperSteps.ShouldBeNull(),
            () => normalized.Frequency.ShouldBe("daily"),
            () => normalized.FrequencyValue.ShouldBe(4),
            () => normalized.DurationUnit.ShouldBe("weeks"),
            () => normalized.DurationValue.ShouldBe(1),
            () => normalized.DoseAmount.ShouldBe(2),
            () => normalized.DoseUnit.ShouldBe("drop"));
    }

    [Fact]
    [Trait("Case", "TAPER-004")]
    public void One_step_replaces_the_dosing_frequency_and_duration()
    {
        var normalized = DosingRules.Normalize(new Dosing
        {
            Frequency = "custom", FrequencyText = "x", DurationUnit = "months", DurationValue = 2,
            TaperSteps = [Step("everyHours", 6, "days", 5)],
        });

        normalized.Frequency.ShouldBe("everyHours");
        normalized.FrequencyValue.ShouldBe(6);
        normalized.FrequencyText.ShouldBeNull();
        normalized.DurationUnit.ShouldBe("days");
        normalized.DurationValue.ShouldBe(5);
    }

    [Fact]
    [Trait("Case", "TAPER-005")]
    public void One_step_with_its_own_dose_gives_its_dose_to_the_dosing()
    {
        var normalized = DosingRules.Normalize(new Dosing
            { DoseAmount = 1, DoseUnit = "drop", TaperSteps = [Step("daily", 4, "weeks", 1, 2)] });

        normalized.DoseAmount.ShouldBe(2);
        normalized.TaperSteps.ShouldBeNull();
    }

    [Fact]
    [Trait("Case", "TAPER-006")]
    public void An_empty_step_list_is_no_schedule()
    {
        DosingRules.Normalize(new Dosing { Eye = "right", TaperSteps = [] }).TaperSteps.ShouldBeNull();
        DosingRules.Normalize(new Dosing { TaperSteps = [] }).ShouldBeNull("nothing else is set");

        var plain = DosingRules.Normalize(new Dosing { Frequency = "daily", FrequencyValue = 2, TaperSteps = [] });
        plain.Frequency.ShouldBe("daily");
        plain.FrequencyValue.ShouldBe(2);
    }

    [Fact]
    [Trait("Case", "TAPER-007")]
    public void Steps_clear_the_dosing_frequency_and_duration()
    {
        var normalized = DosingRules.Normalize(new Dosing
        {
            DoseAmount = 1, DoseUnit = "drop", Frequency = "daily", FrequencyValue = 3, FrequencyText = "x",
            DurationUnit = "days", DurationValue = 5,
            TaperSteps = [Step("daily", 4, "weeks", 1), Step("daily", 3, "weeks", 1)],
        });

        normalized.ShouldSatisfyAllConditions(
            () => normalized.Frequency.ShouldBeNull(),
            () => normalized.FrequencyValue.ShouldBeNull(),
            () => normalized.FrequencyText.ShouldBeNull(),
            () => normalized.DurationUnit.ShouldBeNull(),
            () => normalized.DurationValue.ShouldBeNull(),
            () => normalized.TaperSteps.Count.ShouldBe(2));
        ShouldBeStep(normalized.TaperSteps[0], "daily", 4, "weeks", 1);
        ShouldBeStep(normalized.TaperSteps[1], "daily", 3, "weeks", 1);
    }

    [Fact]
    [Trait("Case", "TAPER-017")]
    public void The_first_step_dose_becomes_the_dosing_dose()
    {
        var normalized = DosingRules.Normalize(new Dosing
        {
            DoseAmount = 1, DoseUnit = "drop",
            TaperSteps = [Step("daily", 4, "weeks", 1, 2), Step("daily", 3, "weeks", 1)],
        });

        normalized.DoseAmount.ShouldBe(2);
        normalized.TaperSteps[0].DoseAmount.ShouldBeNull();
    }

    [Fact]
    [Trait("Case", "TAPER-017")]
    public void The_first_step_dose_fills_an_empty_dosing_dose()
    {
        var normalized = DosingRules.Normalize(new Dosing
            { DoseUnit = "drop", TaperSteps = [Step("daily", 4, "weeks", 1, 2), Step("daily", 3, "weeks", 1)] });

        normalized.DoseAmount.ShouldBe(2);
        normalized.TaperSteps[0].DoseAmount.ShouldBeNull();
    }

    [Fact]
    public void Without_a_first_step_dose_the_dosing_dose_stays()
    {
        var normalized = DosingRules.Normalize(new Dosing
            { DoseAmount = 2, DoseUnit = "drop", TaperSteps = [Step("daily", 4, "weeks", 1), Step("daily", 3, "weeks", 1, 1)] });

        normalized.DoseAmount.ShouldBe(2);
        normalized.TaperSteps[1].DoseAmount.ShouldBe(1);
    }

    [Fact]
    [Trait("Case", "TAPER-018")]
    public void A_later_step_dose_equal_to_the_dosing_dose_is_cleared()
    {
        var normalized = DosingRules.Normalize(new Dosing
        {
            DoseAmount = 2, DoseUnit = "drop",
            TaperSteps = [Step("daily", 4, "weeks", 1), Step("daily", 3, "weeks", 1, 1), Step("daily", 2, "weeks", 1, 2)],
        });

        normalized.DoseAmount.ShouldBe(2);
        normalized.TaperSteps[1].DoseAmount.ShouldBe(1, "a different dose stays");
        normalized.TaperSteps[2].DoseAmount.ShouldBeNull("the same dose as the dosing");
    }

    [Fact]
    [Trait("Case", "TAPER-018")]
    public void A_later_step_dose_equal_to_the_moved_first_step_dose_is_cleared()
    {
        var normalized = DosingRules.Normalize(new Dosing
        {
            DoseAmount = 1, DoseUnit = "drop",
            TaperSteps = [Step("daily", 4, "weeks", 1, 2), Step("daily", 3, "weeks", 1, 2), Step("daily", 2, "weeks", 1, 1)],
        });

        normalized.DoseAmount.ShouldBe(2);
        normalized.TaperSteps.Select(s => s.DoseAmount).ShouldBe([null, null, 1m]);
    }

    [Fact]
    [Trait("Case", "TAPER-019")]
    public void Step_values_that_do_not_apply_are_dropped()
    {
        var normalized = DosingRules.Normalize(new Dosing
        {
            TaperSteps = [Step("everyHours", 6, "days", 3), Step("everyHours", 8, "continuous", 4)],
        });

        ShouldBeStep(normalized.TaperSteps[0], "everyHours", 6, "days", 3);
        ShouldBeStep(normalized.TaperSteps[1], "everyHours", 8, "continuous", null);
    }

    [Theory]
    [Trait("Case", "TAPER-019")]
    [InlineData("bedtime")]
    [InlineData("asNeeded")]
    [InlineData("custom")]
    public void A_step_number_for_a_frequency_without_one_is_dropped(string frequency)
    {
        var normalized = DosingRules.Normalize(new Dosing
            { TaperSteps = [Step("daily", 4, "weeks", 1), Step(frequency, 3, "untilNextVisit", 2)] });

        ShouldBeStep(normalized.TaperSteps[1], frequency, null, "untilNextVisit", null);
    }

    [Theory]
    [InlineData("days")]
    [InlineData("weeks")]
    [InlineData("months")]
    public void A_step_is_cleaned_like_a_dosing_and_keeps_a_counted_period(string unit)
    {
        // "steps are cleaned like a dosing": a number of days, weeks or months applies, so it stays (months are then
        // refused by IsValid, not dropped by Normalize)
        var normalized = DosingRules.Normalize(new Dosing
            { TaperSteps = [Step("daily", 4, unit, 2), Step("everyHours", 6, unit, 3)] });

        ShouldBeStep(normalized.TaperSteps[0], "daily", 4, unit, 2);
        ShouldBeStep(normalized.TaperSteps[1], "everyHours", 6, unit, 3);
    }

    [Fact]
    [Trait("Case", "TAPER-019")]
    public void Blank_step_codes_become_null()
    {
        var normalized = DosingRules.Normalize(new Dosing
            { TaperSteps = [Step("daily", 4, "weeks", 1), Step(" ", 3, "", 2)] });

        ShouldBeStep(normalized.TaperSteps[1], null, null, null, null);
    }

    [Fact]
    public void A_null_step_is_rejected_not_an_error()
    {
        // A JSON body may hold `taperSteps: [{…}, null]`: a step needs a frequency and a period, so it is invalid
        var normalized = DosingRules.Normalize(new Dosing { TaperSteps = [Step("daily", 4, "weeks", 1), null] });

        DosingRules.IsValid(normalized).ShouldBeFalse();
    }

    [Fact]
    public void Unit_and_eye_stay_on_the_dosing()
    {
        var normalized = DosingRules.Normalize(new Dosing
        {
            DoseAmount = 2, DoseUnit = "drop", Eye = "right",
            TaperSteps = [Step("daily", 4, "weeks", 1), Step("daily", 3, "weeks", 1, 1)],
        });

        normalized.DoseUnit.ShouldBe("drop");
        normalized.Eye.ShouldBe("right");
    }
}
