using ClinicHub.Application.Features.Prescriptions.Templates;
using static ClinicHub.UnitTests.Prescriptions.Templates.TemplateLayouts;

namespace ClinicHub.UnitTests.Prescriptions.Templates;

/// <summary>Contract § 1.4 rules 8i and 8j: where a box is, its size and font; missing numbers; the order inside an item.</summary>
[Trait("Area", "admin")]
public class TemplateItemBoxRulesTests
{
    // ---- 8i: inside the sheet (TPL-024) ----

    [Fact]
    [Trait("Case", "TPL-024")]
    public void An_item_ending_exactly_on_the_edge_passes_on_each_size()
    {
        ShouldPass(OnA5(PrescriptionText(xMm: 28, yMm: 120, wMm: 120, hMm: 90)));
        ShouldPass(Layout(A4, PrescriptionText(xMm: 90, yMm: 207, wMm: 120, hMm: 90)));
        ShouldPass(Layout(Custom(100, 60), PrescriptionText(xMm: 50, yMm: 40, wMm: 50, hMm: 20)));
    }

    [Fact]
    [Trait("Case", "TPL-024")]
    public void An_item_filling_the_sheet_passes()
    {
        ShouldPass(OnA5(PrescriptionText(xMm: 0, yMm: 0, wMm: 148, hMm: 210)));
    }

    [Fact]
    [Trait("Case", "TPL-024")]
    public void An_item_0_1_mm_past_the_edge_is_templateItemOutsidePage_on_its_axis()
    {
        ShouldFail(OnA5(PrescriptionText(xMm: 28.1m, yMm: 80, wMm: 120, hMm: 90)), ("items[0].xMm", "templateItemOutsidePage"));
        ShouldFail(OnA5(PrescriptionText(xMm: 14, yMm: 120.1m, wMm: 120, hMm: 90)), ("items[0].yMm", "templateItemOutsidePage"));
        ShouldFail(Layout(A4, PrescriptionText(xMm: 90.1m, yMm: 80, wMm: 120, hMm: 90)), ("items[0].xMm", "templateItemOutsidePage"));
        ShouldFail(Layout(A4, PrescriptionText(xMm: 14, yMm: 207.1m, wMm: 120, hMm: 90)), ("items[0].yMm", "templateItemOutsidePage"));
    }

    [Fact]
    [Trait("Case", "TPL-024")]
    public void A_negative_X_or_Y_is_templateItemOutsidePage()
    {
        ShouldFail(OnA5(PrescriptionText(xMm: -0.1m)), ("items[0].xMm", "templateItemOutsidePage"));
        ShouldFail(OnA5(PrescriptionText(yMm: -0.1m)), ("items[0].yMm", "templateItemOutsidePage"));
        ShouldFail(OnA5(PrescriptionText(xMm: -0.05m)), ("items[0].xMm", "templateItemOutsidePage"));
    }

    [Fact]
    [Trait("Case", "TPL-024")]
    public void A_start_of_0_passes_and_a_negative_that_rounds_to_0_passes()
    {
        ShouldPass(OnA5(PrescriptionText(xMm: 0, yMm: 0)));
        ShouldPass(OnA5(PrescriptionText(xMm: -0.04m, yMm: -0.04m)));
    }

    [Fact]
    [Trait("Case", "TPL-024")]
    public void An_item_too_big_for_the_sheet_names_X_or_Y()
    {
        ShouldFail(OnA5(PrescriptionText(xMm: 0, wMm: 148.1m)), ("items[0].xMm", "templateItemOutsidePage"));
        ShouldFail(OnA5(PrescriptionText(yMm: 0, hMm: 210.1m)), ("items[0].yMm", "templateItemOutsidePage"));
    }

    [Fact]
    [Trait("Case", "TPL-024")]
    public void An_item_outside_on_both_axes_answers_X_then_Y()
    {
        ShouldFail(OnA5(PrescriptionText(xMm: 100, yMm: 200)),
            ("items[0].xMm", "templateItemOutsidePage"),
            ("items[0].yMm", "templateItemOutsidePage"));
    }

    [Fact]
    [Trait("Case", "TPL-024")]
    public void A_huge_value_is_outside_and_never_overflows()
    {
        ShouldFail(OnA5(PrescriptionText(xMm: decimal.MaxValue, wMm: decimal.MaxValue)), ("items[0].xMm", "templateItemOutsidePage"));
        ShouldFail(OnA5(PrescriptionText(yMm: decimal.MaxValue, hMm: decimal.MaxValue)), ("items[0].yMm", "templateItemOutsidePage"));
    }

    [Fact]
    [Trait("Case", "TPL-025")]
    public void A_negative_size_is_a_size_error_only_it_counts_as_0_for_outside()
    {
        ShouldFail(OnA5(PrescriptionText(), Manual(xMm: 148, wMm: -5)), ("items[1].wMm", "templateItemSizeInvalid"));
        ShouldFail(OnA5(PrescriptionText(), Manual(yMm: 210, hMm: -5)), ("items[1].hMm", "templateItemSizeInvalid"));
    }

    // ---- 8j: size and font (TPL-025, TPL-026) ----

    [Theory]
    [Trait("Case", "TPL-025")]
    [InlineData("manualInput")]
    [InlineData("function")]
    [InlineData("staticText")]
    public void Width_4_9_and_height_3_9_are_refused_and_5_and_4_pass(string kind)
    {
        var item = ItemOfKind(kind);

        ShouldFail(OnA5(PrescriptionText(), item with { WMm = 4.9m }), ("items[1].wMm", "templateItemSizeInvalid"));
        ShouldPass(OnA5(PrescriptionText(), item with { WMm = 5 }));
        ShouldFail(OnA5(PrescriptionText(), item with { HMm = 3.9m }), ("items[1].hMm", "templateItemSizeInvalid"));
        ShouldPass(OnA5(PrescriptionText(), item with { HMm = 4 }));
    }

    [Fact]
    [Trait("Case", "TPL-025")]
    public void The_prescription_text_needs_a_height_of_20_and_the_usual_width()
    {
        ShouldFail(OnA5(PrescriptionText(hMm: 19.9m)), ("items[0].hMm", "templateItemSizeInvalid"));
        ShouldPass(OnA5(PrescriptionText(hMm: 20)));
        ShouldFail(OnA5(PrescriptionText(wMm: 4.9m)), ("items[0].wMm", "templateItemSizeInvalid"));
        ShouldPass(OnA5(PrescriptionText(wMm: 5)));
    }

    [Theory]
    [Trait("Case", "TPL-026")]
    [InlineData("prescriptionText")]
    [InlineData("manualInput")]
    [InlineData("function")]
    [InlineData("staticText")]
    public void A_font_of_5_9_or_36_1_is_refused_and_6_and_36_pass(string kind)
    {
        PrescriptionLayoutDto With(decimal font) => kind == "prescriptionText"
            ? OnA5(PrescriptionText(fontSizePt: font))
            : OnA5(PrescriptionText(), ItemOfKind(kind) with { FontSizePt = font });
        var field = kind == "prescriptionText" ? "items[0].fontSizePt" : "items[1].fontSizePt";

        ShouldFail(With(5.9m), (field, "templateFontSizeInvalid"));
        ShouldPass(With(6));
        ShouldPass(With(36));
        ShouldFail(With(36.1m), (field, "templateFontSizeInvalid"));
    }

    // ---- Missing numbers (contract § 1.2): invalidRequest naming each, never 0 ----

    [Fact]
    [Trait("Case", "TPL-025")]
    public void Each_missing_number_is_invalidRequest_naming_it()
    {
        var item = PrescriptionText();

        ShouldFail(OnA5(item with { XMm = null }), ("items[0].xMm", "invalidRequest"));
        ShouldFail(OnA5(item with { YMm = null }), ("items[0].yMm", "invalidRequest"));
        ShouldFail(OnA5(item with { WMm = null }), ("items[0].wMm", "invalidRequest"));
        ShouldFail(OnA5(item with { HMm = null }), ("items[0].hMm", "invalidRequest"));
        ShouldFail(OnA5(item with { FontSizePt = null }), ("items[0].fontSizePt", "invalidRequest"));
    }

    [Fact]
    [Trait("Case", "TPL-025")]
    public void All_the_missing_numbers_come_in_the_order_X_Y_width_height_font()
    {
        ShouldFail(OnA5(PrescriptionText() with { XMm = null, YMm = null, WMm = null, HMm = null, FontSizePt = null }),
            ("items[0].xMm", "invalidRequest"),
            ("items[0].yMm", "invalidRequest"),
            ("items[0].wMm", "invalidRequest"),
            ("items[0].hMm", "invalidRequest"),
            ("items[0].fontSizePt", "invalidRequest"));
    }

    [Fact]
    [Trait("Case", "TPL-024")]
    public void A_missing_length_counts_as_0_for_outside_and_is_named_itself()
    {
        ShouldFail(OnA5(PrescriptionText(xMm: 148) with { WMm = null }), ("items[0].wMm", "invalidRequest"));
        ShouldFail(OnA5(PrescriptionText(xMm: 148.1m) with { WMm = null }),
            ("items[0].xMm", "templateItemOutsidePage"),
            ("items[0].wMm", "invalidRequest"));
        ShouldFail(OnA5(PrescriptionText(yMm: 210) with { HMm = null }), ("items[0].hMm", "invalidRequest"));
        ShouldFail(OnA5(PrescriptionText(yMm: 210.1m) with { HMm = null }),
            ("items[0].yMm", "templateItemOutsidePage"),
            ("items[0].hMm", "invalidRequest"));
    }

    [Fact]
    [Trait("Case", "TPL-023")]
    public void A_missing_number_is_answered_when_the_page_failed_too()
    {
        ShouldFail(Layout(new("A5", 150, 210), PrescriptionText() with { XMm = null, YMm = 500 }),
            ("page.widthMm", "templatePageInvalid"),
            ("items[0].xMm", "invalidRequest"));
    }

    // ---- The order inside an item (contract § 6 item 9) ----

    [Fact]
    [Trait("Case", "TPL-021")]
    public void A_functions_errors_come_id_function_name_X_Y_width_height_font()
    {
        ShouldFail(OnA5(PrescriptionText(), FunctionItem("nope", "", "bad id", xMm: 500, yMm: 500, wMm: 1, hMm: 1, fontSizePt: 1)),
            ("items[1].id", "templateLayoutInvalid"),
            ("items[1].function", "templateLayoutInvalid"),
            ("items[1].name", "nameRequired"),
            ("items[1].xMm", "templateItemOutsidePage"),
            ("items[1].yMm", "templateItemOutsidePage"),
            ("items[1].wMm", "templateItemSizeInvalid"),
            ("items[1].hMm", "templateItemSizeInvalid"),
            ("items[1].fontSizePt", "templateFontSizeInvalid"));
    }

    [Fact]
    [Trait("Case", "TPL-030")]
    public void A_static_texts_errors_come_id_text_X_Y_width_height_font()
    {
        ShouldFail(OnA5(PrescriptionText(), StaticItem("", "bad id", xMm: 500, yMm: 500, wMm: 1, hMm: 1, fontSizePt: 40)),
            ("items[1].id", "templateLayoutInvalid"),
            ("items[1].text", "templateStaticTextRequired"),
            ("items[1].xMm", "templateItemOutsidePage"),
            ("items[1].yMm", "templateItemOutsidePage"),
            ("items[1].wMm", "templateItemSizeInvalid"),
            ("items[1].hMm", "templateItemSizeInvalid"),
            ("items[1].fontSizePt", "templateFontSizeInvalid"));
    }

    [Fact]
    [Trait("Case", "TPL-021")]
    public void Items_are_answered_in_their_order_after_the_page_and_the_text_count()
    {
        ShouldFail(Layout(new("A5", 148, 200), Manual("", "m1"), StaticItem("", "s1")) with { SchemaVersion = 3 },
            ("schemaVersion", "templateLayoutInvalid"),
            ("page.heightMm", "templatePageInvalid"),
            ("items", "templateTextCount"),
            ("items[0].name", "nameRequired"),
            ("items[1].text", "templateStaticTextRequired"));
    }

    // ---- Overlap (TPL-208) ----

    [Fact]
    [Trait("Case", "TPL-208")]
    public void Items_with_the_same_box_pass_whatever_their_kinds()
    {
        ShouldPass(OnA5(
            PrescriptionText(xMm: 10, yMm: 10, wMm: 30, hMm: 20),
            Manual(xMm: 10, yMm: 10, wMm: 30, hMm: 20),
            FunctionItem(xMm: 10, yMm: 10, wMm: 30, hMm: 20),
            StaticItem(xMm: 10, yMm: 10, wMm: 30, hMm: 20)));
    }

    // ---- Rounding comes first (TPL-209, TPL-210) ----

    [Fact]
    [Trait("Case", "TPL-209")]
    public void Validation_sees_the_rounded_values()
    {
        ShouldPass(OnA5(PrescriptionText(wMm: 4.95m)));
        ShouldFail(OnA5(PrescriptionText(wMm: 4.94m)), ("items[0].wMm", "templateItemSizeInvalid"));
        ShouldPass(OnA5(PrescriptionText(hMm: 19.95m)));
        ShouldFail(OnA5(PrescriptionText(hMm: 19.94m)), ("items[0].hMm", "templateItemSizeInvalid"));
        ShouldPass(OnA5(PrescriptionText(fontSizePt: 5.95m)));
        ShouldFail(OnA5(PrescriptionText(fontSizePt: 5.94m)), ("items[0].fontSizePt", "templateFontSizeInvalid"));
        ShouldPass(OnA5(PrescriptionText(xMm: 28.04m, wMm: 120)));
        ShouldFail(OnA5(PrescriptionText(xMm: 28.05m, wMm: 120)), ("items[0].xMm", "templateItemOutsidePage"));
    }

    [Fact]
    [Trait("Case", "TPL-210")]
    public void The_sums_are_exact_on_a_page_of_210_1()
    {
        ShouldPass(Layout(Custom(210.1m, 200), PrescriptionText(xMm: 0.3m, wMm: 209.8m)));
        ShouldFail(Layout(Custom(210.1m, 200), PrescriptionText(xMm: 0.4m, wMm: 209.8m)), ("items[0].xMm", "templateItemOutsidePage"));
    }

    [Fact]
    [Trait("Case", "TPL-210")]
    public void The_same_on_the_vertical_axis()
    {
        ShouldPass(Layout(Custom(200, 210.1m), PrescriptionText(yMm: 0.3m, hMm: 209.8m)));
        ShouldFail(Layout(Custom(200, 210.1m), PrescriptionText(yMm: 0.4m, hMm: 209.8m)), ("items[0].yMm", "templateItemOutsidePage"));
    }

}
