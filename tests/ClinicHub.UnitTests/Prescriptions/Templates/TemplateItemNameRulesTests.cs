using ClinicHub.Application.Features.Prescriptions.Templates;
using ClinicHub.Application.Features.Prescriptions.Templates.Commands.SavePrescriptionTemplate;
using ClinicHub.UnitTests.TestSupport;
using Shouldly;
using static ClinicHub.UnitTests.Prescriptions.Templates.TemplateLayouts;

namespace ClinicHub.UnitTests.Prescriptions.Templates;

/// <summary>Contract § 1.4 rules 8d and 8e: the name of a manual input or a function, and names that repeat.</summary>
[Trait("Area", "admin")]
public class TemplateItemNameRulesTests
{
    /// <summary>A manual input or a function holding this name, beside the prescription text (index 1).</summary>
    private static PrescriptionLayoutDto WithName(string kind, string name) =>
        OnA5(PrescriptionText(), ItemOfKind(kind) with { Name = name });

    // ---- Required (TPL-027, TPL-211) ----

    [Theory]
    [Trait("Case", "TPL-027")]
    [InlineData("manualInput", null)]
    [InlineData("manualInput", "")]
    [InlineData("manualInput", "   ")]
    [InlineData("manualInput", "\t")]
    [InlineData("function", null)]
    [InlineData("function", "")]
    [InlineData("function", "   ")]
    public void An_empty_or_only_spaces_name_is_nameRequired(string kind, string name)
    {
        ShouldFail(WithName(kind, name), ("items[1].name", "nameRequired"));
    }

    [Theory]
    [Trait("Case", "TPL-211")]
    [InlineData("manualInput", 0x200B)]
    [InlineData("manualInput", 0xFEFF)]
    [InlineData("manualInput", 0x00AD)]
    [InlineData("function", 0x200B)]
    public void A_name_of_only_an_invisible_format_character_is_nameRequired(string kind, int code)
    {
        ShouldFail(WithName(kind, ((char)code).ToString()), ("items[1].name", "nameRequired"));
    }

    [Fact]
    [Trait("Case", "TPL-211")]
    public void A_name_of_invisible_characters_and_spaces_is_nameRequired()
    {
        ShouldFail(WithName("manualInput", $" {Text.ZeroWidthSpace} {Text.ZeroWidthNonJoiner} "), ("items[1].name", "nameRequired"));
    }

    // ---- Refused characters (TPL-032, TPL-211) ----

    [Theory]
    [Trait("Case", "TPL-211")]
    [InlineData(0x200E)]
    [InlineData(0x200F)]
    [InlineData(0x061C)]
    [InlineData(0x200C)]
    [InlineData(0x200D)]
    public void Marks_and_joiners_inside_a_name_pass_and_stay(int code)
    {
        var name = $"اسم{(char)code}آخر";

        ShouldPass(WithName("manualInput", name));
        SavePrescriptionTemplateCommand.From(WithName("manualInput", name)).Items[1].Name.ShouldBe(name);
    }

    [Theory]
    [Trait("Case", "TPL-211")]
    [Trait("Case", "TPL-032")]
    [InlineData(0x202A)]
    [InlineData(0x202B)]
    [InlineData(0x202C)]
    [InlineData(0x202D)]
    [InlineData(0x202E)]
    [InlineData(0x2066)]
    [InlineData(0x2067)]
    [InlineData(0x2068)]
    [InlineData(0x2069)]
    public void A_bidi_override_or_isolate_inside_a_name_is_nameInvalid(int code)
    {
        ShouldFail(WithName("manualInput", $"اسم{(char)code}آخر"), ("items[1].name", "nameInvalid"));
        ShouldFail(WithName("function", $"اسم{(char)code}آخر"), ("items[1].name", "nameInvalid"));
    }

    [Theory]
    [Trait("Case", "TPL-032")]
    [InlineData(0x0000)]
    [InlineData(0x0007)]
    [InlineData(0x000A)]
    [InlineData(0x000D)]
    [InlineData(0x0009)]
    [InlineData(0x2028)]
    [InlineData(0x2029)]
    public void A_control_character_or_a_line_break_inside_a_name_is_nameInvalid(int code)
    {
        ShouldFail(WithName("manualInput", $"اسم{(char)code}آخر"), ("items[1].name", "nameInvalid"));
    }

    // ---- Length (TPL-028, TPL-213) ----

    [Theory]
    [Trait("Case", "TPL-028")]
    [InlineData("manualInput")]
    [InlineData("function")]
    public void A_name_of_60_passes_and_61_is_nameTooLong(string kind)
    {
        ShouldPass(WithName(kind, Text.OfLength(60)));
        ShouldFail(WithName(kind, Text.OfLength(61)), ("items[1].name", "nameTooLong"));
    }

    [Fact]
    [Trait("Case", "TPL-213")]
    public void A_name_of_60_with_spaces_around_it_passes_and_is_kept_trimmed()
    {
        var name = Text.OfLength(60);
        var layout = WithName("manualInput", $"   {name}  ");

        ShouldPass(layout);
        SavePrescriptionTemplateCommand.From(layout).Items[1].Name.ShouldBe(name);
    }

    [Fact]
    [Trait("Case", "TPL-213")]
    public void A_name_of_61_with_spaces_around_it_is_nameTooLong()
    {
        ShouldFail(WithName("manualInput", $"  {Text.OfLength(61)}  "), ("items[1].name", "nameTooLong"));
    }

    [Fact]
    [Trait("Case", "TPL-032")]
    public void The_shared_name_rule_answers_a_refused_character_and_the_length_in_that_order()
    {
        ShouldFail(WithName("manualInput", Text.OfLength(60) + "\u202E"), ("items[1].name", "nameInvalid"), ("items[1].name", "nameTooLong"));
    }

    // ---- Repeated names (TPL-029) ----

    [Theory]
    [Trait("Case", "TPL-029")]
    [InlineData("الاسم", " الاسم ")]
    [InlineData(" الاسم", "الاسم  ")]
    [InlineData("Age", "age")]
    [InlineData("AGE", "age")]
    [InlineData("age", "AgE")]
    public void A_name_equal_once_trimmed_and_ignoring_case_refuses_the_later_item(string first, string second)
    {
        ShouldFail(OnA5(PrescriptionText(), Manual(first, "m1"), Manual(second, "m2")), ("items[2].name", "templateItemNameTaken"));
    }

    [Fact]
    [Trait("Case", "TPL-029")]
    public void Manual_inputs_and_functions_share_the_names_in_both_orders()
    {
        ShouldFail(OnA5(PrescriptionText(), Manual("Age"), FunctionItem(name: "age")), ("items[2].name", "templateItemNameTaken"));
        ShouldFail(OnA5(PrescriptionText(), FunctionItem(name: "age"), Manual("Age")), ("items[2].name", "templateItemNameTaken"));
        ShouldFail(OnA5(PrescriptionText(), FunctionItem("time", "age", "f1"), FunctionItem("fullDate", "Age", "f2")), ("items[2].name", "templateItemNameTaken"));
    }

    [Fact]
    [Trait("Case", "TPL-029")]
    public void Every_later_item_with_the_name_is_refused_and_another_item_between_them_changes_nothing()
    {
        ShouldFail(OnA5(PrescriptionText(), Manual("السن", "m1"), Manual("الاسم", "m2"), FunctionItem(name: "السن"), Manual("السن", "m3")),
            ("items[3].name", "templateItemNameTaken"),
            ("items[4].name", "templateItemNameTaken"));
    }

    [Fact]
    [Trait("Case", "TPL-029")]
    public void Different_names_pass()
    {
        ShouldPass(OnA5(PrescriptionText(), Manual("الاسم"), FunctionItem(name: "السن")));
    }

    [Fact]
    [Trait("Case", "TPL-029")]
    public void A_static_text_is_not_a_name_before_or_after_one()
    {
        ShouldPass(OnA5(PrescriptionText(), StaticItem("الاسم"), Manual("الاسم"), StaticItem("الاسم", "s2")));
    }

    [Fact]
    [Trait("Case", "TPL-027")]
    public void Blank_names_never_repeat_each_answers_nameRequired()
    {
        ShouldFail(OnA5(PrescriptionText(), Manual("", "m1"), Manual("  ", "m2"), FunctionItem(name: null)),
            ("items[1].name", "nameRequired"),
            ("items[2].name", "nameRequired"),
            ("items[3].name", "nameRequired"));
    }

    [Fact]
    [Trait("Case", "TPL-029")]
    public void A_refused_name_still_counts_as_taken()
    {
        var tooLong = Text.OfLength(61);

        ShouldFail(OnA5(PrescriptionText(), Manual(tooLong, "m1"), Manual(tooLong, "m2")),
            ("items[1].name", "nameTooLong"),
            ("items[2].name", "nameTooLong"),
            ("items[2].name", "templateItemNameTaken"));
    }
}
