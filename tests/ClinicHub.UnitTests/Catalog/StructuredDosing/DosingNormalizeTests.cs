using ClinicHub.Domain.Catalog;
using Shouldly;

namespace ClinicHub.UnitTests.Catalog.StructuredDosing;

/// <summary>
/// <c>DosingRules.Normalize</c> (dosing tech § Backend): trims, drops fields that don't apply, returns null when empty.
/// </summary>
[Trait("Area", "catalog")]
public class DosingNormalizeTests
{
    [Theory]
    [Trait("Case", "DOSE-061")]
    [InlineData("bedtime")]
    [InlineData("asNeeded")]
    [InlineData("custom")]
    public void A_frequency_without_a_number_drops_the_number(string frequency)
    {
        var normalized = DosingRules.Normalize(new Dosing { Frequency = frequency, FrequencyValue = 3, FrequencyText = "x" });

        normalized.Frequency.ShouldBe(frequency);
        normalized.FrequencyValue.ShouldBeNull();
    }

    [Theory]
    [InlineData("daily", 3)]
    [InlineData("everyHours", 8)]
    public void A_frequency_with_a_number_keeps_it(string frequency, int value)
    {
        var normalized = DosingRules.Normalize(new Dosing { Frequency = frequency, FrequencyValue = value });

        normalized.FrequencyValue.ShouldBe(value);
    }

    [Theory]
    [Trait("Case", "DOSE-062")]
    [InlineData("daily")]
    [InlineData("everyHours")]
    [InlineData("bedtime")]
    [InlineData("asNeeded")]
    [InlineData(null)]
    public void A_non_custom_frequency_drops_the_text(string frequency)
    {
        var normalized = DosingRules.Normalize(new Dosing
            { Frequency = frequency, FrequencyValue = 2, FrequencyText = "بعد الأكل", Eye = "right" });

        normalized.FrequencyText.ShouldBeNull();
    }

    [Fact]
    [Trait("Case", "DOSE-062")]
    public void Custom_text_is_trimmed()
    {
        var normalized = DosingRules.Normalize(new Dosing { Frequency = "custom", FrequencyText = "  صباحًا ومساءً  " });

        normalized.FrequencyText.ShouldBe("صباحًا ومساءً");
    }

    [Fact]
    [Trait("Case", "DOSE-062")]
    public void Custom_text_of_only_spaces_becomes_null()
    {
        DosingRules.Normalize(new Dosing { Frequency = "custom", FrequencyText = "   " }).FrequencyText.ShouldBeNull();
    }

    [Theory]
    [Trait("Case", "DOSE-063")]
    [InlineData("continuous")]
    [InlineData("untilNextVisit")]
    [InlineData(null)]
    public void An_open_ended_duration_drops_the_number(string unit)
    {
        var normalized = DosingRules.Normalize(new Dosing { DurationUnit = unit, DurationValue = 4, Eye = "left" });

        normalized.DurationUnit.ShouldBe(unit);
        normalized.DurationValue.ShouldBeNull();
    }

    [Theory]
    [InlineData("days")]
    [InlineData("weeks")]
    [InlineData("months")]
    public void A_counted_duration_keeps_the_number(string unit)
    {
        DosingRules.Normalize(new Dosing { DurationUnit = unit, DurationValue = 4 }).DurationValue.ShouldBe(4);
    }

    [Fact]
    [Trait("Case", "DOSE-064")]
    public void Blank_codes_become_null()
    {
        var normalized = DosingRules.Normalize(new Dosing
            { DoseAmount = 1, DoseUnit = "", Frequency = "  ", DurationUnit = "\t", Eye = " " });

        normalized.ShouldNotBeNull("the amount is still set");
        normalized.DoseUnit.ShouldBeNull();
        normalized.Frequency.ShouldBeNull();
        normalized.DurationUnit.ShouldBeNull();
        normalized.Eye.ShouldBeNull();
    }

    [Fact]
    [Trait("Case", "DOSE-064")]
    [Trait("Case", "DOSE-065")]
    public void Only_blank_codes_is_no_dosing()
    {
        DosingRules.Normalize(new Dosing { DoseUnit = "", Frequency = "  ", DurationUnit = "", Eye = " " }).ShouldBeNull();
    }

    [Fact]
    [Trait("Case", "DOSE-059")]
    [Trait("Case", "DOSE-065")]
    [Trait("Tier", "Smoke")]
    public void All_fields_empty_is_no_dosing()
    {
        DosingRules.Normalize(new Dosing()).ShouldBeNull();
        DosingRules.Normalize(null).ShouldBeNull();
    }

    [Fact]
    [Trait("Case", "DOSE-065")]
    public void Values_that_do_not_apply_alone_are_no_dosing()
    {
        // A number or a text without the option it belongs to is dropped, and nothing is left
        DosingRules.Normalize(new Dosing { FrequencyValue = 3, FrequencyText = "x", DurationValue = 5 }).ShouldBeNull();
    }

    [Theory]
    [InlineData("doseAmount")]
    [InlineData("doseUnit")]
    [InlineData("frequency")]
    [InlineData("durationUnit")]
    [InlineData("eye")]
    public void Any_one_set_field_keeps_the_dosing(string field)
    {
        var dosing = field switch
        {
            "doseAmount" => new Dosing { DoseAmount = 2 },
            "doseUnit" => new Dosing { DoseUnit = "drop" },
            "frequency" => new Dosing { Frequency = "bedtime" },
            "durationUnit" => new Dosing { DurationUnit = "continuous" },
            _ => new Dosing { Eye = "both" },
        };

        DosingRules.Normalize(dosing).ShouldNotBeNull();
    }

    [Fact]
    public void A_valid_dosing_is_kept_as_is()
    {
        var normalized = DosingRules.Normalize(new Dosing
        {
            DoseAmount = 2, DoseUnit = "drop", Eye = "left", Frequency = "daily", FrequencyValue = 6,
            DurationUnit = "weeks", DurationValue = 2,
        });

        normalized.ShouldSatisfyAllConditions(
            () => normalized.DoseAmount.ShouldBe(2),
            () => normalized.DoseUnit.ShouldBe("drop"),
            () => normalized.Eye.ShouldBe("left"),
            () => normalized.Frequency.ShouldBe("daily"),
            () => normalized.FrequencyValue.ShouldBe(6),
            () => normalized.FrequencyText.ShouldBeNull(),
            () => normalized.DurationUnit.ShouldBe("weeks"),
            () => normalized.DurationValue.ShouldBe(2),
            () => normalized.TaperSteps.ShouldBeNull());
    }

    [Fact]
    public void Normalize_does_not_change_its_input()
    {
        // The validator and then the handler both normalize the same request dosing: the second must see the original
        var input = new Dosing
        {
            DoseAmount = 1, DoseUnit = "drop", Frequency = "bedtime", FrequencyValue = 3,
            TaperSteps = [new TaperStep { DoseAmount = 2, Frequency = "daily", FrequencyValue = 4, DurationUnit = "weeks", DurationValue = 1 }],
        };

        DosingRules.Normalize(input);

        input.DoseAmount.ShouldBe(1);
        input.FrequencyValue.ShouldBe(3);
        input.TaperSteps[0].DoseAmount.ShouldBe(2);
    }
}
