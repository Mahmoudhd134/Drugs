using ClinicHub.Domain.Catalog;
using Shouldly;

namespace ClinicHub.UnitTests.Catalog.StructuredDosing;

/// <summary>
/// The dosing limits (dosing business § القواعد, dosing tech § Data model), checked the way the validators run them:
/// <c>IsValid(Normalize(dosing))</c>.
/// </summary>
[Trait("Area", "catalog")]
public class DosingValidityTests
{
    private static bool Accepted(Dosing dosing, bool groupLine = false) =>
        DosingRules.IsValid(DosingRules.Normalize(dosing), allowAskEye: groupLine);

    [Theory]
    [Trait("Case", "DOSE-043")]
    [Trait("Case", "DOSE-044")]
    [Trait("Case", "DOSE-045")]
    [Trait("Tier", "Smoke")]
    [InlineData(0, false)]
    [InlineData(-1, false)]
    [InlineData(0.001, true)]
    [InlineData(0.5, true)]
    [InlineData(1000, true)]
    [InlineData(1000.5, false)]
    [InlineData(1001, false)]
    public void Dose_amount_must_be_above_0_and_at_most_1000(double amount, bool valid)
    {
        Accepted(new Dosing { DoseAmount = (decimal)amount, DoseUnit = "drop" })
            .ShouldBe(valid, $"dose amount {amount} with a unit");
    }

    [Theory]
    [Trait("Case", "DOSE-046")]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("  ")]
    public void Dose_amount_without_a_unit_is_invalid(string unit)
    {
        Accepted(new Dosing { DoseAmount = 2, DoseUnit = unit }).ShouldBeFalse();
    }

    [Theory]
    [Trait("Case", "DOSE-047")]
    [InlineData("drop")]
    [InlineData("tablet")]
    [InlineData("capsule")]
    [InlineData("ml")]
    [InlineData("application")]
    public void Unit_without_an_amount_is_valid(string unit)
    {
        Accepted(new Dosing { DoseUnit = unit }).ShouldBeTrue();
    }

    [Theory]
    [Trait("Case", "DOSE-048")]
    [Trait("Tier", "Smoke")]
    [InlineData(0, false)]
    [InlineData(1, true)]
    [InlineData(24, true)]
    [InlineData(25, false)]
    public void Daily_needs_1_to_24_times(int times, bool valid)
    {
        Accepted(new Dosing { Frequency = "daily", FrequencyValue = times }).ShouldBe(valid, $"daily {times}");
    }

    [Fact]
    [Trait("Case", "DOSE-049")]
    public void Daily_without_a_number_is_invalid()
    {
        Accepted(new Dosing { Frequency = "daily" }).ShouldBeFalse();
    }

    [Theory]
    [Trait("Case", "DOSE-050")]
    [InlineData(0, false)]
    [InlineData(1, true)]
    [InlineData(72, true)]
    [InlineData(73, false)]
    [InlineData(null, false)]
    public void Every_hours_needs_1_to_72_hours(int? hours, bool valid)
    {
        Accepted(new Dosing { Frequency = "everyHours", FrequencyValue = hours }).ShouldBe(valid, $"every {hours} hours");
    }

    [Theory]
    [Trait("Case", "DOSE-051")]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   ")]
    [InlineData("\t \n")]
    public void Custom_frequency_needs_a_text(string text)
    {
        Accepted(new Dosing { Frequency = "custom", FrequencyText = text }).ShouldBeFalse();
    }

    [Fact]
    public void Custom_text_is_at_most_200_characters_after_trimming()
    {
        // dosing tech § Data model: FrequencyText string(200) (catalog DOSE-052 at the API level)
        Accepted(new Dosing { Frequency = "custom", FrequencyText = "  " + new string('ن', 200) + "  " }).ShouldBeTrue();
        Accepted(new Dosing { Frequency = "custom", FrequencyText = new string('x', 201) }).ShouldBeFalse();
    }

    [Fact]
    public void Custom_text_with_a_NUL_is_invalid()
    {
        // drugs tech § Backend: a NUL can't be stored (catalog DOSE-054 at the API level)
        Accepted(new Dosing { Frequency = "custom", FrequencyText = "a\0b" }).ShouldBeFalse();
    }

    [Theory]
    [Trait("Case", "DOSE-055")]
    [Trait("Tier", "Smoke")]
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
    [InlineData("months", 0, false)]
    [InlineData("months", 1, true)]
    [InlineData("months", 365, true)]
    [InlineData("months", 366, false)]
    [InlineData("months", null, false)]
    public void Days_weeks_and_months_need_1_to_365(string unit, int? value, bool valid)
    {
        Accepted(new Dosing { DurationUnit = unit, DurationValue = value }).ShouldBe(valid, $"{value} {unit}");
    }

    [Theory]
    [InlineData("continuous")]
    [InlineData("untilNextVisit")]
    public void Open_ended_durations_need_no_number(string unit)
    {
        Accepted(new Dosing { DurationUnit = unit }).ShouldBeTrue();
    }

    [Theory]
    [InlineData("bedtime")]
    [InlineData("asNeeded")]
    public void Bedtime_and_as_needed_need_no_number(string frequency)
    {
        Accepted(new Dosing { Frequency = frequency }).ShouldBeTrue();
    }

    [Fact]
    [Trait("Case", "DOSE-059")]
    public void Empty_dosing_is_valid()
    {
        Accepted(new Dosing()).ShouldBeTrue();
        DosingRules.IsValid(null).ShouldBeTrue("no dosing is valid");
    }

    [Theory]
    [InlineData("doseUnit", "spoon")]
    [InlineData("doseUnit", "Drop")]
    [InlineData("frequency", "weekly")]
    [InlineData("frequency", "Daily")]
    [InlineData("durationUnit", "years")]
    [InlineData("durationUnit", "Days")]
    [InlineData("eye", "top")]
    [InlineData("eye", "Right")]
    public void Unknown_codes_and_codes_in_another_case_are_invalid(string field, string code)
    {
        // dosing tech § Data model: only the listed codes, exactly (catalog DOSE-056/DOSE-057 at the API level)
        var dosing = field switch
        {
            "doseUnit" => new Dosing { DoseUnit = code },
            "frequency" => new Dosing { Frequency = code, FrequencyValue = 1 },
            "durationUnit" => new Dosing { DurationUnit = code, DurationValue = 1 },
            _ => new Dosing { Eye = code },
        };
        Accepted(dosing).ShouldBeFalse();
        Accepted(dosing, groupLine: true).ShouldBeFalse();
    }

    [Theory]
    [InlineData("right")]
    [InlineData("left")]
    [InlineData("both")]
    [InlineData("none")]
    public void Every_eye_is_valid_on_a_drug_and_a_group_line(string eye)
    {
        Accepted(new Dosing { Eye = eye }).ShouldBeTrue();
        Accepted(new Dosing { Eye = eye }, groupLine: true).ShouldBeTrue();
    }

    [Fact]
    public void Ask_eye_is_only_valid_on_a_group_line()
    {
        // dosing tech § Backend: allowAskEye, only group lines (catalog DOSE-058 at the API level)
        Accepted(new Dosing { Eye = "ask" }).ShouldBeFalse("a drug's default dosing can't ask");
        Accepted(new Dosing { Eye = "ask" }, groupLine: true).ShouldBeTrue();
    }

    [Fact]
    public void Every_known_code_is_accepted()
    {
        foreach (var unit in DosingCodes.DoseUnits)
            Accepted(new Dosing { DoseAmount = 1, DoseUnit = unit }).ShouldBeTrue(unit);
        Accepted(new Dosing { Frequency = "custom", FrequencyText = "بعد الأكل" }).ShouldBeTrue();
        DosingCodes.DoseUnits.ShouldBe(["drop", "tablet", "capsule", "ml", "application"]);
        DosingCodes.Frequencies.ShouldBe(["daily", "everyHours", "bedtime", "asNeeded", "custom"]);
        DosingCodes.DurationUnits.ShouldBe(["days", "weeks", "months", "continuous", "untilNextVisit"]);
        DosingCodes.Eyes.ShouldBe(["right", "left", "both", "none"]);
        DosingCodes.GroupEyes.ShouldBe(["right", "left", "both", "none", "ask"]);
    }

    [Fact]
    public void A_full_dosing_is_valid()
    {
        Accepted(new Dosing
        {
            DoseAmount = 2, DoseUnit = "drop", Eye = "left", Frequency = "daily", FrequencyValue = 6,
            DurationUnit = "weeks", DurationValue = 2,
        }).ShouldBeTrue();
    }
}
