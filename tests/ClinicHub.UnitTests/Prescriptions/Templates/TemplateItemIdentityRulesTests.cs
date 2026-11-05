using ClinicHub.Application.Features.Prescriptions.Templates.Commands.SavePrescriptionTemplate;
using ClinicHub.Domain.Prescriptions;
using Shouldly;
using static ClinicHub.UnitTests.Prescriptions.Templates.TemplateLayouts;

namespace ClinicHub.UnitTests.Prescriptions.Templates;

/// <summary>Contract § 1.4 rules 8a–8c: an item's id, kind and function, and fields of another kind (§ 1.3).</summary>
[Trait("Area", "admin")]
public class TemplateItemIdentityRulesTests
{
    // ---- 8a: id ----

    [Theory]
    [Trait("Case", "TPL-214")]
    [InlineData(null)]
    [InlineData("")]
    [InlineData(" ")]
    [InlineData("a b")]
    [InlineData("a.b")]
    [InlineData("a/b")]
    [InlineData("أ1")]
    [InlineData("١")]
    [InlineData("a\n")]
    public void A_missing_empty_or_malformed_id_is_templateLayoutInvalid(string id)
    {
        ShouldFail(OnA5(PrescriptionText(), Manual(id: id)), ("items[1].id", "templateLayoutInvalid"));
    }

    [Theory]
    [Trait("Case", "TPL-214")]
    [InlineData("a")]
    [InlineData("Z")]
    [InlineData("0")]
    [InlineData("9")]
    [InlineData("_")]
    [InlineData("-")]
    [InlineData("i1")]
    [InlineData("a-B_9")]
    public void Letters_digits_underscore_and_dash_are_an_id(string id)
    {
        ShouldPass(OnA5(PrescriptionText(), Manual(id: id)));
    }

    [Fact]
    [Trait("Case", "TPL-214")]
    public void An_id_is_at_most_40_characters()
    {
        ShouldPass(OnA5(PrescriptionText(id: new string('a', PrescriptionTemplateLimits.ItemIdMaxLength))));
        ShouldFail(OnA5(PrescriptionText(id: new string('a', PrescriptionTemplateLimits.ItemIdMaxLength + 1))), ("items[0].id", "templateLayoutInvalid"));
    }

    [Fact]
    [Trait("Case", "TPL-021")]
    public void A_repeated_id_refuses_every_later_item_never_the_first()
    {
        ShouldFail(OnA5(PrescriptionText("x"), Manual("الاسم", "x"), FunctionItem(id: "y"), StaticItem(id: "x")),
            ("items[1].id", "templateLayoutInvalid"),
            ("items[3].id", "templateLayoutInvalid"));
    }

    [Fact]
    [Trait("Case", "TPL-021")]
    public void Ids_compare_exactly_so_another_case_is_another_id()
    {
        ShouldPass(OnA5(PrescriptionText("a1"), Manual(id: "A1")));
    }

    [Fact]
    [Trait("Case", "TPL-214")]
    public void Two_items_without_an_id_are_each_refused_once()
    {
        ShouldFail(OnA5(PrescriptionText(id: null), Manual(id: null)),
            ("items[0].id", "templateLayoutInvalid"),
            ("items[1].id", "templateLayoutInvalid"));
    }

    [Fact]
    [Trait("Case", "TPL-214")]
    public void A_malformed_id_repeated_is_one_error_per_item()
    {
        ShouldFail(OnA5(PrescriptionText("a b"), Manual(id: "a b")),
            ("items[0].id", "templateLayoutInvalid"),
            ("items[1].id", "templateLayoutInvalid"));
    }

    // ---- 8b: kind ----

    [Theory]
    [Trait("Case", "TPL-021")]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("qrCode")]
    [InlineData("ManualInput")]
    [InlineData("MANUALINPUT")]
    [InlineData("statictext")]
    public void An_unknown_kind_is_templateLayoutInvalid_and_skips_the_items_other_rules(string kind)
    {
        // Everything else about this item is wrong too: only the kind is answered
        var item = new ClinicHub.Application.Features.Prescriptions.Templates.PrescriptionItemDto(
            "x1", kind, "nope", "", "", -5, -5, 1, 1, 1);

        ShouldFail(OnA5(PrescriptionText(), item), ("items[1].kind", "templateLayoutInvalid"));
    }

    [Theory]
    [Trait("Case", "TPL-022")]
    [InlineData("internalData")]
    [InlineData("expression")]
    public void A_selectable_later_kind_is_templateLayoutInvalid(string kind)
    {
        ShouldFail(OnA5(PrescriptionText(), Manual() with { Kind = kind }), ("items[1].kind", "templateLayoutInvalid"));
    }

    [Fact]
    [Trait("Case", "TPL-021")]
    public void An_unknown_kind_keeps_its_id_rule_first()
    {
        ShouldFail(OnA5(PrescriptionText(), Manual(id: "") with { Kind = "qrCode" }),
            ("items[1].id", "templateLayoutInvalid"),
            ("items[1].kind", "templateLayoutInvalid"));
    }

    // ---- 8c: function ----

    [Theory]
    [Trait("Case", "TPL-021")]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("unixTime")]
    [InlineData("FullDate")]
    [InlineData("fulldate")]
    public void An_unknown_or_missing_function_is_templateLayoutInvalid(string function)
    {
        ShouldFail(OnA5(PrescriptionText(), FunctionItem(function)), ("items[1].function", "templateLayoutInvalid"));
    }

    [Theory]
    [Trait("Case", "TPL-021")]
    [InlineData("fullDate")]
    [InlineData("time")]
    [InlineData("dayOfWeek")]
    [InlineData("dayOfMonth")]
    [InlineData("isoDateTime")]
    [InlineData("pageNumber")]
    public void Each_of_the_six_functions_passes(string function)
    {
        ShouldPass(OnA5(PrescriptionText(), FunctionItem(function)));
    }

    // ---- Fields of another kind (TPL-203's rule: Normalize drops them, so they are never validated) ----

    [Fact]
    [Trait("Case", "TPL-021")]
    public void Another_kinds_fields_are_not_validated()
    {
        ShouldPass(OnA5(
            PrescriptionText() with { Function = "nope", Name = "", Text = "" },
            Manual() with { Function = "nope", Text = "" },
            FunctionItem() with { Text = "" },
            StaticItem() with { Function = "nope", Name = "" }));
    }

    [Fact]
    [Trait("Case", "TPL-021")]
    public void Another_kinds_name_doesnt_take_a_name()
    {
        ShouldPass(OnA5(PrescriptionText() with { Name = "الاسم" }, StaticItem() with { Name = "الاسم" }, Manual("الاسم")));
    }

    [Fact]
    [Trait("Case", "TPL-021")]
    public void From_keeps_each_kinds_fields_only()
    {
        var command = SavePrescriptionTemplateCommand.From(OnA5(
            PrescriptionText() with { Function = "fullDate", Name = "n", Text = "x" },
            Manual("م") with { Function = "fullDate", Text = "x" },
            FunctionItem("time", "د") with { Text = "x" },
            StaticItem("ث") with { Function = "fullDate", Name = "n" }));

        var (text, manual, function, staticText) = (command.Items[0], command.Items[1], command.Items[2], command.Items[3]);
        (text.Function, text.Name, text.Text).ShouldBe((null, null, null));
        (manual.Function, manual.Name, manual.Text).ShouldBe((null, "م", null));
        (function.Function, function.Name, function.Text).ShouldBe(("time", "د", null));
        (staticText.Function, staticText.Name, staticText.Text).ShouldBe((null, null, "ث"));
    }
}
