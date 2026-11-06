using ClinicHub.Application.Features.Prescriptions.Templates;
using ClinicHub.Application.Features.Prescriptions.Templates.Commands.SavePrescriptionTemplate;
using Shouldly;
using static ClinicHub.UnitTests.Prescriptions.Templates.TemplateLayouts;

namespace ClinicHub.UnitTests.Prescriptions.Templates;

/// <summary>
/// An item's horizontal alignment (step 4 contract § 4.3.2): <c>Normalize</c> keeps it on a manual input, a function and a static text only, and
/// another value, case-sensitive, answers <c>templateLayoutInvalid</c> on <c>items[i].align</c>, after the item's font and before the calibration.
/// </summary>
[Trait("Area", "admin")]
public class TemplateItemAlignRulesTests
{
    private const string Invalid = "templateLayoutInvalid";

    private static readonly string[] Kinds = ["manualInput", "function", "staticText"];

    private static TheoryData<string, string> EachKindWith(params string[] aligns)
    {
        var data = new TheoryData<string, string>();
        foreach (var kind in Kinds)
            foreach (var align in aligns)
                data.Add(kind, align);
        return data;
    }

    public static TheoryData<string, string> Allowed => EachKindWith("right", "center", "left");

    public static TheoryData<string, string> Refused =>
        EachKindWith("Center", "CENTER", "Right", "RIGHT", "Left", "LEFT", "justify", "start", "end", "middle", "", " ", " right", "right ", "right,left", "0");

    public static TheoryData<string> ShortKinds => new(Kinds);

    private static PrescriptionItemDto Aligned(string kind, string align) => ItemOfKind(kind) with { Align = align };

    // ---- Normalize ----

    [Theory]
    [MemberData(nameof(Allowed))]
    [Trait("Case", "TPL-738")]
    public void Normalize_keeps_the_alignment_on_a_short_item(string kind, string align)
    {
        PrescriptionLayoutRules.Normalize(OnA5(PrescriptionText(), Aligned(kind, align))).Items[1].Align.ShouldBe(align);
    }

    [Theory]
    [MemberData(nameof(ShortKinds))]
    [Trait("Case", "TPL-738")]
    public void Normalize_keeps_another_value_as_it_came_for_the_rules_to_refuse(string kind)
    {
        PrescriptionLayoutRules.Normalize(OnA5(PrescriptionText(), Aligned(kind, " Center "))).Items[1].Align.ShouldBe(" Center ");
    }

    [Theory]
    [InlineData("center")]
    [InlineData("Center")]
    [Trait("Case", "TPL-738")]
    public void Normalize_drops_the_alignment_on_the_prescription_text_and_on_an_unknown_kind(string align)
    {
        var items = PrescriptionLayoutRules.Normalize(OnA5(
            PrescriptionText() with { Align = align },
            Manual() with { Kind = "qrCode", Align = align })).Items;

        items.Select(i => i.Align).ShouldBe([null, null]);
    }

    [Theory]
    [MemberData(nameof(ShortKinds))]
    [Trait("Case", "TPL-738")]
    public void Normalize_leaves_a_missing_alignment_null(string kind)
    {
        PrescriptionLayoutRules.Normalize(OnA5(PrescriptionText(), ItemOfKind(kind))).Items[1].Align.ShouldBeNull();
    }

    [Fact]
    [Trait("Case", "TPL-738")]
    public void Normalize_keeps_the_other_fields_of_an_aligned_item()
    {
        var normalized = PrescriptionLayoutRules.Normalize(OnA5(Manual(" الاسم ", xMm: 12.34m) with { Align = "left" })).Items[0];

        normalized.ShouldBe(Manual("الاسم", xMm: 12.3m) with { Align = "left" });
    }

    [Fact]
    [Trait("Case", "TPL-738")]
    public void From_sends_the_alignment_of_a_short_item_and_drops_the_prescription_texts()
    {
        var command = SavePrescriptionTemplateCommand.From(OnA5(PrescriptionText() with { Align = "left" }, StaticItem() with { Align = "center" }));

        command.Items.Select(i => i.Align).ShouldBe([null, "center"]);
    }

    // ---- The rule ----

    [Theory]
    [MemberData(nameof(Allowed))]
    [Trait("Case", "TPL-738")]
    public void Right_center_and_left_pass_on_every_short_kind(string kind, string align)
    {
        ShouldPass(OnA5(PrescriptionText(), Aligned(kind, align)));
    }

    [Theory]
    [MemberData(nameof(ShortKinds))]
    [Trait("Case", "TPL-738")]
    public void A_missing_or_null_alignment_passes(string kind)
    {
        ShouldPass(OnA5(PrescriptionText(), ItemOfKind(kind)));
        ShouldPass(OnA5(PrescriptionText(), Aligned(kind, null)));
    }

    [Theory]
    [MemberData(nameof(Refused))]
    [Trait("Case", "TPL-738")]
    public void Another_value_is_templateLayoutInvalid_on_the_items_align(string kind, string align)
    {
        ShouldFail(OnA5(PrescriptionText(), Aligned(kind, align)), ("items[1].align", Invalid));
    }

    [Theory]
    [InlineData("center")]
    [InlineData("Center")]
    [InlineData("justify")]
    [InlineData("")]
    [Trait("Case", "TPL-738")]
    public void The_prescription_text_passes_whatever_it_holds_since_its_alignment_is_dropped_first(string align)
    {
        ShouldPass(OnA5(PrescriptionText() with { Align = align }));
    }

    [Fact]
    [Trait("Case", "TPL-738")]
    public void An_unknown_kind_answers_only_its_kind()
    {
        ShouldFail(OnA5(PrescriptionText(), Manual() with { Kind = "qrCode", Align = "Center" }), ("items[1].kind", Invalid));
    }

    [Fact]
    [Trait("Case", "TPL-738")]
    public void The_alignment_comes_after_the_font()
    {
        ShouldFail(OnA5(PrescriptionText(), Manual(fontSizePt: 37) with { Align = "Center" }),
            ("items[1].fontSizePt", "templateFontSizeInvalid"), ("items[1].align", Invalid));
    }

    [Fact]
    [Trait("Case", "TPL-738")]
    public void The_alignment_comes_before_the_next_item_and_each_is_named_at_its_own_index()
    {
        ShouldFail(OnA5(PrescriptionText(), Manual() with { Align = "Center" }, FunctionItem() with { Align = "right" }, StaticItem("") with { Align = "justify" }),
            ("items[1].align", Invalid), ("items[3].text", "templateStaticTextRequired"), ("items[3].align", Invalid));
    }

    [Fact]
    [Trait("Case", "TPL-738")]
    public void The_alignment_comes_before_the_calibration()
    {
        ShouldFail(WithCalibration(OnA5(PrescriptionText(), Manual() with { Align = "Center" }), 20.1m, 0),
            ("items[1].align", Invalid), ("calibration.xMm", "templateCalibrationInvalid"));
    }

    [Fact]
    [Trait("Case", "TPL-738")]
    public void Over_50_items_only_the_count_is_answered()
    {
        var items = ManyManual(51);
        items[0] = items[0] with { Align = "Center" };

        ShouldFail(OnA5(items), ("items", "templateTooManyItems"));
    }
}
