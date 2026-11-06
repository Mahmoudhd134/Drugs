using Shouldly;
using static ClinicHub.UnitTests.Prescriptions.Templates.TemplateLayouts;

namespace ClinicHub.UnitTests.Prescriptions.Templates;

/// <summary>Contract § 1.4 rules 1–7: the schema version, the page, the item limit and the prescription text.</summary>
[Trait("Area", "admin")]
public class TemplatePageAndCountRulesTests
{
    /// <summary>Fits every page of these tests (the smallest is 50 × 50), so a failure comes from the page alone.</summary>
    private static readonly ClinicHub.Application.Features.Prescriptions.Templates.PrescriptionItemDto SmallText =
        PrescriptionText(xMm: 0, yMm: 0, wMm: 10, hMm: 20);

    // ---- Rule 1: schema version ----

    [Theory]
    [Trait("Case", "TPL-021")]
    [InlineData(null)]
    [InlineData(0)]
    [InlineData(2)]
    [InlineData(-1)]
    public void A_schema_version_other_than_1_is_templateLayoutInvalid(int? version)
    {
        ShouldFail(OnA5(PrescriptionText()) with { SchemaVersion = version }, ("schemaVersion", "templateLayoutInvalid"));
    }

    [Fact]
    [Trait("Case", "TPL-021")]
    public void Schema_version_1_passes()
    {
        ShouldPass(OnA5(PrescriptionText()) with { SchemaVersion = 1 });
    }

    // ---- Rules 2 and 3: page and size ----

    [Fact]
    [Trait("Case", "TPL-023")]
    public void A_missing_page_is_invalidRequest_naming_it_and_no_item_is_checked_against_a_page()
    {
        ShouldFail(new(1, null, [PrescriptionText(xMm: 500, yMm: 500)], null), ("page", "invalidRequest"));
    }

    [Theory]
    [Trait("Case", "TPL-023")]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("A3")]
    [InlineData("a5")]
    [InlineData("a4")]
    [InlineData("Custom")]
    [InlineData("CUSTOM")]
    [InlineData(" A5")]
    public void An_unknown_size_is_only_this_page_error_case_sensitive(string size)
    {
        // Measures that a known size would refuse: nothing but page.size is answered
        ShouldFail(Layout(new(size, null, 9999), PrescriptionText(xMm: 500)), ("page.size", "templatePageInvalid"));
    }

    // ---- Rule 4: missing measures ----

    [Theory]
    [Trait("Case", "TPL-023")]
    [InlineData("A5", 148, 210)]
    [InlineData("A4", 210, 297)]
    [InlineData("custom", 148, 210)]
    public void A_missing_width_or_height_is_invalidRequest_naming_it_never_0(string size, int width, int height)
    {
        ShouldFail(Layout(new(size, null, height), SmallText), ("page.widthMm", "invalidRequest"));
        ShouldFail(Layout(new(size, width, null), SmallText), ("page.heightMm", "invalidRequest"));
        ShouldFail(Layout(new(size, null, null), SmallText), ("page.widthMm", "invalidRequest"), ("page.heightMm", "invalidRequest"));
    }

    [Fact]
    [Trait("Case", "TPL-023")]
    public void The_missing_measures_come_before_the_wrong_ones()
    {
        ShouldFail(Layout(new("A5", 150, null), SmallText), ("page.heightMm", "invalidRequest"), ("page.widthMm", "templatePageInvalid"));
    }

    // ---- Rule 5: measures ----

    [Theory]
    [Trait("Case", "TPL-023")]
    [InlineData("A5", 148, 210, true)]
    [InlineData("A5", 147.9, 210, false)]
    [InlineData("A5", 148.1, 210, false)]
    [InlineData("A5", 148, 209.9, false)]
    [InlineData("A5", 148, 210.1, false)]
    [InlineData("A5", 210, 148, false)]
    [InlineData("A4", 210, 297, true)]
    [InlineData("A4", 209.9, 297, false)]
    [InlineData("A4", 210.1, 297, false)]
    [InlineData("A4", 210, 296.9, false)]
    [InlineData("A4", 210, 297.1, false)]
    [InlineData("A4", 148, 297, false)]
    public void A5_and_A4_take_only_their_own_measures(string size, double width, double height, bool valid)
    {
        var (widthMm, heightMm) = ((decimal)width, (decimal)height);
        var (rightWidth, rightHeight) = size == "A5" ? (148m, 210m) : (210m, 297m);
        var layout = Layout(new(size, widthMm, heightMm), SmallText);

        if (valid)
            ShouldPass(layout);
        else if (widthMm != rightWidth && heightMm != rightHeight)
            ShouldFail(layout, ("page.widthMm", "templatePageInvalid"), ("page.heightMm", "templatePageInvalid"));
        else if (widthMm != rightWidth)
            ShouldFail(layout, ("page.widthMm", "templatePageInvalid"));
        else
            ShouldFail(layout, ("page.heightMm", "templatePageInvalid"));
    }

    [Theory]
    [Trait("Case", "TPL-023")]
    [InlineData(49, false)]
    [InlineData(49.9, false)]
    [InlineData(49.94, false)]
    [InlineData(49.95, true)]
    [InlineData(50, true)]
    [InlineData(420, true)]
    [InlineData(420.04, true)]
    [InlineData(420.05, false)]
    [InlineData(420.1, false)]
    [InlineData(421, false)]
    public void A_custom_width_is_50_to_420_after_rounding(double width, bool valid)
    {
        var layout = Layout(Custom((decimal)width, 100), SmallText);

        if (valid)
            ShouldPass(layout);
        else
            ShouldFail(layout, ("page.widthMm", "templatePageInvalid"));
    }

    [Theory]
    [Trait("Case", "TPL-023")]
    [InlineData(49, false)]
    [InlineData(49.9, false)]
    [InlineData(49.94, false)]
    [InlineData(49.95, true)]
    [InlineData(50, true)]
    [InlineData(600, true)]
    [InlineData(600.04, true)]
    [InlineData(600.05, false)]
    [InlineData(600.1, false)]
    [InlineData(601, false)]
    public void A_custom_height_is_50_to_600_after_rounding(double height, bool valid)
    {
        var layout = Layout(Custom(100, (decimal)height), SmallText);

        if (valid)
            ShouldPass(layout);
        else
            ShouldFail(layout, ("page.heightMm", "templatePageInvalid"));
    }

    [Fact]
    [Trait("Case", "TPL-023")]
    public void A_custom_page_outside_on_both_sides_answers_the_width_then_the_height()
    {
        ShouldFail(Layout(Custom(49, 601), SmallText), ("page.widthMm", "templatePageInvalid"), ("page.heightMm", "templatePageInvalid"));
    }

    [Fact]
    [Trait("Case", "TPL-023")]
    public void A_page_that_fails_skips_the_outside_checks_but_not_the_sizes_or_fonts()
    {
        var item = PrescriptionText(xMm: -5, yMm: -5, wMm: 1, hMm: 1, fontSizePt: 1);

        ShouldFail(Layout(new("A5", 150, 210), item),
            ("page.widthMm", "templatePageInvalid"),
            ("items[0].wMm", "templateItemSizeInvalid"),
            ("items[0].hMm", "templateItemSizeInvalid"),
            ("items[0].fontSizePt", "templateFontSizeInvalid"));
    }

    [Fact]
    [Trait("Case", "TPL-023")]
    public void A_page_with_a_missing_measure_skips_the_outside_checks_too()
    {
        ShouldFail(Layout(new("A5", null, 210), PrescriptionText(xMm: 500, yMm: 500)), ("page.widthMm", "invalidRequest"));
    }

    // ---- Rule 6: at most 50 items ----

    [Fact]
    [Trait("Case", "TPL-031")]
    public void Fifty_items_pass()
    {
        ShouldPass(OnA5([PrescriptionText(), .. ManyManual(49)]));
    }

    [Theory]
    [Trait("Case", "TPL-031")]
    [InlineData(50)]
    [InlineData(200)]
    public void Over_50_items_is_one_error_and_no_item_rule_runs(int manual)
    {
        // Past the limit even a broken item or a missing prescription text adds nothing
        var broken = Manual("", "bad id", xMm: -1, wMm: 1, hMm: 1, fontSizePt: 1);

        ShouldFail(OnA5([PrescriptionText(), .. ManyManual(manual)]), ("items", "templateTooManyItems"));
        ShouldFail(OnA5([broken, .. ManyManual(manual + 1)]), ("items", "templateTooManyItems"));
    }

    [Fact]
    [Trait("Case", "TPL-031")]
    public void Over_50_items_still_answers_the_schema_version_and_the_page_first()
    {
        ShouldFail(Layout(new("A5", 150, 210), [PrescriptionText(), .. ManyManual(50)]) with { SchemaVersion = 2 },
            ("schemaVersion", "templateLayoutInvalid"),
            ("page.widthMm", "templatePageInvalid"),
            ("items", "templateTooManyItems"));
    }

    // ---- Rule 7: exactly one prescription text ----

    [Fact]
    [Trait("Case", "TPL-020")]
    public void No_prescription_text_is_templateTextCount()
    {
        ShouldFail(OnA5(Manual()), ("items", "templateTextCount"));
    }

    [Fact]
    [Trait("Case", "TPL-020")]
    public void Two_or_three_prescription_texts_are_one_templateTextCount()
    {
        ShouldFail(OnA5(PrescriptionText("t1"), PrescriptionText("t2")), ("items", "templateTextCount"));
        ShouldFail(OnA5(PrescriptionText("t1"), PrescriptionText("t2"), PrescriptionText("t3")), ("items", "templateTextCount"));
    }

    [Fact]
    [Trait("Case", "TPL-020")]
    public void The_kind_of_the_prescription_text_is_case_sensitive()
    {
        ShouldFail(OnA5(PrescriptionText() with { Kind = "PrescriptionText" }),
            ("items", "templateTextCount"),
            ("items[0].kind", "templateLayoutInvalid"));
    }

    [Fact]
    [Trait("Case", "TPL-214")]
    public void No_items_empty_or_missing_is_templateTextCount()
    {
        ShouldFail(OnA5(), ("items", "templateTextCount"));
        ShouldFail(new(1, A5, null, null), ("items", "templateTextCount"));
    }

    [Fact]
    [Trait("Case", "TPL-020")]
    public void A_valid_layout_of_each_kind_passes_and_its_answer_has_no_error()
    {
        var answer = Check(OnA5(PrescriptionText(), Manual(), FunctionItem(), StaticItem()));

        answer.IsValid.ShouldBeTrue();
        answer.Errors.ShouldBeEmpty();
    }

    // ---- Null elements (contract § 6 item 6) ----

    [Fact]
    [Trait("Case", "TPL-021")]
    public void A_null_item_is_templateLayoutInvalid_on_it_and_nothing_else()
    {
        ShouldFail(OnA5(PrescriptionText(), null), ("items[1]", "templateLayoutInvalid"));
    }

    [Fact]
    [Trait("Case", "TPL-021")]
    public void A_list_of_only_a_null_item_has_no_prescription_text_either()
    {
        ShouldFail(OnA5([null]), ("items", "templateTextCount"), ("items[0]", "templateLayoutInvalid"));
    }

    [Fact]
    [Trait("Case", "TPL-021")]
    public void A_null_item_before_others_answers_where_it_stands_and_the_later_items_are_still_checked()
    {
        ShouldFail(OnA5(null, PrescriptionText(), Manual("", "m1")),
            ("items[0]", "templateLayoutInvalid"),
            ("items[2].name", "nameRequired"));
    }
}
