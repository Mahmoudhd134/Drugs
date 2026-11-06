using System.Text.Json.Nodes;
using ClinicHub.Application.Features.Prescriptions.Templates;
using ClinicHub.Application.Features.Prescriptions.Templates.Commands.SavePrescriptionTemplate;
using Shouldly;
using static ClinicHub.UnitTests.Prescriptions.Templates.TemplateLayouts;

namespace ClinicHub.UnitTests.Prescriptions.Templates;

/// <summary>
/// The printer's correction (step 4 design § 4, contract § 2.2): <c>Normalize</c>, <c>Deserialize</c> and rules 9 and 10 of the validator, run as the API
/// runs them. Rule 9 is all X and Y nulls, then rule 10 all their ranges, whatever the item count; item rules don't look at the correction.
/// </summary>
[Trait("Area", "admin")]
public class TemplateCalibrationRulesTests
{
    private const string X = "calibration.xMm";
    private const string Y = "calibration.yMm";
    private const string OutOfRange = "templateCalibrationInvalid";
    private const string Missing = "invalidRequest";

    private static PrescriptionLayoutDto Calibrated(decimal? xMm, decimal? yMm, params PrescriptionItemDto[] items) =>
        WithCalibration(items.Length == 0 ? OnA5(PrescriptionText()) : OnA5(items), xMm, yMm);

    private static PrescriptionLayoutDto OverFifty(decimal? xMm, decimal? yMm) =>
        WithCalibration(OnA5([PrescriptionText(), .. ManyManual(50)]), xMm, yMm);

    // ---- Rule 10: the range, after rounding ----

    public static TheoryData<decimal> InRange => new() { -20m, 20m, -20.04m, 20.04m, 0m, 19.9m, -19.9m, 2m, -1.5m };

    [Theory]
    [MemberData(nameof(InRange))]
    [Trait("Case", "TPL-607")]
    [Trait("Case", "TPL-721")]
    public void A_number_that_rounds_into_the_limits_saves_on_each_axis(decimal value)
    {
        ShouldPass(Calibrated(value, 0));
        ShouldPass(Calibrated(0, value));
    }

    [Fact]
    [Trait("Case", "TPL-607")]
    public void The_numbers_past_the_limit_by_less_than_half_a_tenth_save_as_the_limit()
    {
        var command = SavePrescriptionTemplateCommand.From(Calibrated(-20.04m, 20.04m));

        command.Calibration.ShouldBe(new PrescriptionCalibrationDto(-20m, 20m));
    }

    public static TheoryData<decimal> PastTheRange => new() { 20.05m, -20.05m, 20.1m, -20.1m, 21m, -21m, 1000m, -1000m };

    [Theory]
    [MemberData(nameof(PastTheRange))]
    [Trait("Case", "TPL-607")]
    [Trait("Case", "TPL-721")]
    public void A_number_that_rounds_past_the_limits_answers_templateCalibrationInvalid_naming_its_field(decimal value)
    {
        ShouldFail(Calibrated(value, 0), (X, OutOfRange));
        ShouldFail(Calibrated(0, value), (Y, OutOfRange));
    }

    [Fact]
    [Trait("Case", "TPL-610")]
    public void Both_out_of_range_answer_X_then_Y()
    {
        ShouldFail(Calibrated(21, -21), (X, OutOfRange), (Y, OutOfRange));
    }

    // ---- Rule 9: not null, before any range ----

    [Fact]
    [Trait("Case", "TPL-609")]
    [Trait("Case", "TPL-610")]
    public void A_null_number_answers_invalidRequest_naming_it_and_no_range_error()
    {
        ShouldFail(Calibrated(null, 0), (X, Missing));
        ShouldFail(Calibrated(0, null), (Y, Missing));
        ShouldFail(Calibrated(null, null), (X, Missing), (Y, Missing));
    }

    [Fact]
    [Trait("Case", "TPL-610")]
    public void Every_null_comes_before_every_range()
    {
        // The session's ruling on the contract: as rules 4 and 5 work, so Y's null is first when X is out of range
        ShouldFail(Calibrated(21, null), (Y, Missing), (X, OutOfRange));
        ShouldFail(Calibrated(null, 21), (X, Missing), (Y, OutOfRange));
    }

    // ---- After every other rule, whatever the item count ----

    [Fact]
    [Trait("Case", "TPL-610")]
    public void Calibration_errors_come_after_every_items_error()
    {
        ShouldFail(Calibrated(21, null, PrescriptionText(), Manual(wMm: 1)),
            ("items[1].wMm", "templateItemSizeInvalid"), (Y, Missing), (X, OutOfRange));
    }

    [Fact]
    [Trait("Case", "TPL-610")]
    public void Calibration_errors_come_after_the_schema_versions_and_the_pages()
    {
        var layout = WithCalibration(Layout(new("A5", 150, 210), PrescriptionText()), 21, null) with { SchemaVersion = 2 };

        ShouldFail(layout,
            ("schemaVersion", "templateLayoutInvalid"),
            ("page.widthMm", "templatePageInvalid"),
            (Y, Missing),
            (X, OutOfRange));
    }

    [Fact]
    [Trait("Case", "TPL-610")]
    public void With_no_page_the_correction_is_still_checked()
    {
        var layout = new PrescriptionLayoutDto(1, null, [PrescriptionText()], new PrescriptionCalibrationDto(21, 0));

        ShouldFail(layout, ("page", "invalidRequest"), (X, OutOfRange));
    }

    [Fact]
    [Trait("Case", "TPL-724")]
    public void Over_50_items_and_a_bad_calibration_answer_both()
    {
        ShouldFail(OverFifty(21, -21), ("items", "templateTooManyItems"), (X, OutOfRange), (Y, OutOfRange));
        ShouldFail(OverFifty(null, null), ("items", "templateTooManyItems"), (X, Missing), (Y, Missing));
        ShouldFail(OverFifty(21, null), ("items", "templateTooManyItems"), (Y, Missing), (X, OutOfRange));
    }

    [Fact]
    [Trait("Case", "TPL-724")]
    public void Over_50_items_and_a_good_calibration_answer_only_the_count()
    {
        ShouldFail(OverFifty(2, -1.5m), ("items", "templateTooManyItems"));
    }

    [Fact]
    [Trait("Case", "TPL-724")]
    public void Exactly_50_items_and_a_bad_calibration_answer_only_the_calibration()
    {
        ShouldFail(WithCalibration(OnA5([PrescriptionText(), .. ManyManual(49)]), 21, 0), (X, OutOfRange));
    }

    // ---- Item rules don't look at the correction ----

    [Fact]
    [Trait("Case", "TPL-705")]
    public void A_box_off_the_sheet_stays_outside_whatever_would_bring_it_back()
    {
        ShouldFail(Calibrated(-20, 0, PrescriptionText(), Manual(xMm: 140, wMm: 20)), ("items[1].xMm", "templateItemOutsidePage"));
        ShouldFail(Calibrated(0, -20, PrescriptionText(), Manual(yMm: 205, hMm: 8)), ("items[1].yMm", "templateItemOutsidePage"));
    }

    [Fact]
    [Trait("Case", "TPL-705")]
    public void A_box_the_correction_would_move_off_the_sheet_still_saves()
    {
        ShouldPass(Calibrated(20, 20, PrescriptionText(), Manual(xMm: 76, yMm: 202, wMm: 72, hMm: 8)));
        ShouldPass(Calibrated(-20, -20, PrescriptionText(), Manual(xMm: 0, yMm: 0)));
    }

    // ---- Normalize ----

    public static TheoryData<decimal, decimal> Rounded => new()
    {
        { 2.345m, 2.3m }, { 2.35m, 2.4m }, { -2.35m, -2.4m }, { 0.05m, 0.1m }, { 20.04m, 20m }, { -20.04m, -20m }, { 20.05m, 20.1m }, { -1.5m, -1.5m },
    };

    [Theory]
    [MemberData(nameof(Rounded))]
    [Trait("Case", "TPL-608")]
    public void Normalize_rounds_both_numbers_with_the_midpoint_away_from_zero(decimal value, decimal rounded)
    {
        PrescriptionLayoutRules.Normalize(Calibrated(value, 0)).Calibration.XMm.ShouldBe(rounded);
        PrescriptionLayoutRules.Normalize(Calibrated(0, value)).Calibration.YMm.ShouldBe(rounded);
    }

    public static TheoryData<decimal> NegativeZeros => new() { -0.04m, -0.01m, -0.0m };

    [Theory]
    [MemberData(nameof(NegativeZeros))]
    [Trait("Case", "TPL-608")]
    [Trait("Case", "TPL-721")]
    public void A_number_that_rounds_to_minus_zero_is_exactly_zero(decimal value)
    {
        var calibration = PrescriptionLayoutRules.Normalize(Calibrated(value, value)).Calibration;

        calibration.XMm.ShouldBe(0m);
        calibration.YMm.ShouldBe(0m);
        decimal.IsNegative(calibration.XMm.Value).ShouldBeFalse("a decimal can hold -0.0, which would be stored and answered as -0.0");
        decimal.IsNegative(calibration.YMm.Value).ShouldBeFalse("a decimal can hold -0.0, which would be stored and answered as -0.0");
    }

    [Fact]
    [Trait("Case", "TPL-608")]
    public void What_is_stored_for_2_345_and_minus_0_04_is_2_3_and_a_zero_with_no_sign()
    {
        var json = JsonNode.Parse(PrescriptionLayoutRules.Serialize(PrescriptionLayoutRules.Normalize(Calibrated(2.345m, -0.04m))));

        ((decimal)json["calibration"]["xMm"]).ShouldBe(2.3m);
        ((decimal)json["calibration"]["yMm"]).ShouldBe(0m);
        json["calibration"]["yMm"].ToJsonString().ShouldNotContain("-");
    }

    [Fact]
    [Trait("Case", "TPL-606")]
    public void Normalize_fills_a_missing_calibration_with_0_0()
    {
        var normalized = PrescriptionLayoutRules.Normalize(OnA5(PrescriptionText()) with { Calibration = null });

        normalized.Calibration.ShouldBe(new PrescriptionCalibrationDto(0, 0));
        ShouldPass(OnA5(PrescriptionText()) with { Calibration = null });
    }

    [Fact]
    [Trait("Case", "TPL-609")]
    public void Normalize_keeps_a_null_number_null_for_the_rules_and_rounds_the_other()
    {
        PrescriptionLayoutRules.Normalize(Calibrated(null, 5.04m)).Calibration.ShouldBe(new PrescriptionCalibrationDto(null, 5m));
        PrescriptionLayoutRules.Normalize(Calibrated(5.05m, null)).Calibration.ShouldBe(new PrescriptionCalibrationDto(5.1m, null));
    }

    [Fact]
    [Trait("Case", "TPL-608")]
    public void From_sends_the_normalized_calibration()
    {
        SavePrescriptionTemplateCommand.From(Calibrated(2.345m, -0.04m)).Calibration.ShouldBe(new PrescriptionCalibrationDto(2.3m, 0));
        SavePrescriptionTemplateCommand.From(OnA5(PrescriptionText()) with { Calibration = null }).Calibration.ShouldBe(new PrescriptionCalibrationDto(0, 0));
    }

    // ---- Deserialize: rows saved before step 4 ----

    private const string Before = """{"schemaVersion":1,"page":{"size":"A5","widthMm":148,"heightMm":210},"items":[{"id":"t1","kind":"prescriptionText","xMm":14,"yMm":80,"wMm":120,"hMm":90,"fontSizePt":11}]}""";

    [Fact]
    [Trait("Case", "TPL-605")]
    public void A_row_with_no_calibration_reads_as_0_0()
    {
        PrescriptionLayoutRules.Deserialize(Before).Calibration.ShouldBe(new PrescriptionCalibrationDto(0, 0));
    }

    [Fact]
    [Trait("Case", "TPL-605")]
    public void A_row_with_a_null_calibration_reads_as_0_0()
    {
        var row = Before[..^1] + ""","calibration":null}""";

        PrescriptionLayoutRules.Deserialize(row).Calibration.ShouldBe(new PrescriptionCalibrationDto(0, 0));
    }

    [Fact]
    [Trait("Case", "TPL-002")]
    public void A_row_with_a_calibration_reads_as_it_is()
    {
        var row = Before[..^1] + ""","calibration":{"xMm":2,"yMm":-1.5}}""";

        PrescriptionLayoutRules.Deserialize(row).Calibration.ShouldBe(new PrescriptionCalibrationDto(2, -1.5m));
    }
}
