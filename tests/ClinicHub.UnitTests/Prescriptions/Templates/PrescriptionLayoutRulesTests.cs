using System.Text.Json.Nodes;
using ClinicHub.Application.Features.Prescriptions.Templates;
using ClinicHub.Application.Features.Prescriptions.Templates.Commands.SavePrescriptionTemplate;
using Shouldly;
using static ClinicHub.UnitTests.Prescriptions.Templates.TemplateLayouts;

namespace ClinicHub.UnitTests.Prescriptions.Templates;

/// <summary>Contract § 1.3: rounding, normalizing, the fit, the name key and the column's JSON.</summary>
[Trait("Area", "admin")]
public class PrescriptionLayoutRulesTests
{
    // ---- Round ----

    public static TheoryData<decimal?, decimal?> Rounded => new()
    {
        { 12.34m, 12.3m }, { 12.35m, 12.4m }, { -12.35m, -12.4m }, { -12.34m, -12.3m }, { 0.05m, 0.1m }, { 0.04m, 0m }, { 148m, 148m }, { null, null },
    };

    [Theory]
    [MemberData(nameof(Rounded))]
    [Trait("Case", "TPL-209")]
    public void Round_keeps_one_decimal_with_the_midpoint_away_from_zero(decimal? value, decimal? rounded)
    {
        PrescriptionLayoutRules.Round(value).ShouldBe(rounded);
    }

    // ---- Normalize ----

    [Fact]
    [Trait("Case", "TPL-209")]
    public void Normalize_rounds_every_number_of_the_page_and_the_items()
    {
        var normalized = PrescriptionLayoutRules.Normalize(new(1, new("custom", 210.14m, 100.05m),
        [
            new("t1", "prescriptionText", null, null, null, 12.34m, 12.35m, 50.14m, 30.15m, 11.04m),
        ]));

        normalized.Page.ShouldBe(new PrescriptionPageDto("custom", 210.1m, 100.1m));
        var item = normalized.Items.ShouldHaveSingleItem();
        item.XMm.ShouldBe(12.3m);
        item.YMm.ShouldBe(12.4m);
        item.WMm.ShouldBe(50.1m);
        item.HMm.ShouldBe(30.2m);
        item.FontSizePt.ShouldBe(11m);
    }

    [Fact]
    public void Normalize_leaves_the_schema_version_size_ids_kinds_and_order_alone()
    {
        var normalized = PrescriptionLayoutRules.Normalize(new(7, new("B5", 1, 2),
        [
            Manual(id: "z") with { Kind = "qrCode" },
            StaticItem(id: "a"),
            PrescriptionText(id: "m"),
        ]));

        normalized.SchemaVersion.ShouldBe(7);
        normalized.Page.Size.ShouldBe("B5");
        normalized.Items.Select(i => i.Id).ShouldBe(["z", "a", "m"]);
        normalized.Items.Select(i => i.Kind).ShouldBe(["qrCode", "staticText", "prescriptionText"]);
    }

    [Fact]
    [Trait("Case", "TPL-213")]
    public void Normalize_trims_names_and_keeps_them_only_on_manual_inputs_and_functions()
    {
        var items = PrescriptionLayoutRules.Normalize(OnA5(
            Manual("  الاسم "),
            FunctionItem(name: "\tالتاريخ\n"),
            PrescriptionText() with { Name = "ن" },
            StaticItem() with { Name = "ن" },
            Manual("ن") with { Kind = "qrCode" })).Items;

        items.Select(i => i.Name).ShouldBe(["الاسم", "التاريخ", null, null, null]);
    }

    [Fact]
    [Trait("Case", "TPL-030")]
    public void Normalize_keeps_a_text_as_typed_only_on_a_static_text()
    {
        const string typed = "  سطر\r\n\tسطر  ";
        var items = PrescriptionLayoutRules.Normalize(OnA5(
            StaticItem(typed),
            PrescriptionText() with { Text = typed },
            Manual() with { Text = typed },
            FunctionItem() with { Text = typed },
            StaticItem(typed) with { Kind = "qrCode" })).Items;

        items.Select(i => i.Text).ShouldBe([typed, null, null, null, null]);
    }

    [Fact]
    [Trait("Case", "TPL-021")]
    public void Normalize_keeps_a_function_code_only_on_a_function_and_never_changes_it()
    {
        var items = PrescriptionLayoutRules.Normalize(OnA5(
            FunctionItem(" Time "),
            PrescriptionText() with { Function = "time" },
            Manual() with { Function = "time" },
            StaticItem() with { Function = "time" })).Items;

        items.Select(i => i.Function).ShouldBe([" Time ", null, null, null]);
    }

    [Fact]
    public void Normalize_keeps_a_null_page_null_items_and_null_elements_and_null_fields()
    {
        PrescriptionLayoutRules.Normalize(new(1, null, null)).ShouldSatisfyAllConditions(
            l => l.Page.ShouldBeNull(),
            l => l.Items.ShouldBeNull());
        PrescriptionLayoutRules.Normalize(OnA5([null])).Items.ShouldBe([null]);

        var item = PrescriptionLayoutRules.Normalize(OnA5(new PrescriptionItemDto(null, null, null, null, null, null, null, null, null, null))).Items[0];
        item.ShouldBe(new PrescriptionItemDto(null, null, null, null, null, null, null, null, null, null));
        PrescriptionLayoutRules.Normalize(OnA5(Manual(null))).Items[0].Name.ShouldBeNull();
        PrescriptionLayoutRules.Normalize(OnA5(StaticItem(null))).Items[0].Text.ShouldBeNull();
        PrescriptionLayoutRules.Normalize(new(1, new("A5", null, null), [])).Page.ShouldBe(new PrescriptionPageDto("A5", null, null));
    }

    [Fact]
    [Trait("Case", "TPL-209")]
    public void From_sends_the_normalized_layout()
    {
        var command = SavePrescriptionTemplateCommand.From(new(1, new("custom", 100.04m, 100.05m), [Manual("  م ", xMm: 12.34m)]));

        command.SchemaVersion.ShouldBe(1);
        command.Page.ShouldBe(new PrescriptionPageDto("custom", 100m, 100.1m));
        command.Items[0].XMm.ShouldBe(12.3m);
        command.Items[0].Name.ShouldBe("م");
    }

    // ---- Fits ----

    public static TheoryData<decimal, decimal?, decimal, bool> Fit => new()
    {
        { 0m, 148m, 148m, true },
        { 28m, 120m, 148m, true },
        { 28.1m, 120m, 148m, false },
        { 0m, 148.1m, 148m, false },
        { -0.1m, 10m, 148m, false },
        { 0m, 0m, 148m, true },
        { 148m, 0m, 148m, true },
        { 148.1m, 0m, 148m, false },
        { 148m, null, 148m, true },
        { 148.1m, null, 148m, false },
        { 10m, -5m, 148m, true },
        { 148m, -5m, 148m, true },
        { 148.1m, -5m, 148m, false },
        { -0.1m, -5m, 148m, false },
        { -0.1m, null, 148m, false },
        { 0.3m, 209.8m, 210.1m, true },
        { 0.4m, 209.8m, 210.1m, false },
        { decimal.MaxValue, decimal.MaxValue, 148m, false },
        { 0m, decimal.MaxValue, 148m, false },
        { decimal.MaxValue, 1m, 148m, false },
        { decimal.MinValue, 1m, 148m, false },
        { decimal.MinValue, decimal.MinValue, 148m, false },
    };

    [Theory]
    [MemberData(nameof(Fit))]
    [Trait("Case", "TPL-024")]
    [Trait("Case", "TPL-210")]
    public void Fits_means_the_whole_length_lies_on_the_sheet(decimal start, decimal? length, decimal sheet, bool fits)
    {
        PrescriptionLayoutRules.Fits(start, length, sheet).ShouldBe(fits);
    }

    // ---- NameKey ----

    [Theory]
    [Trait("Case", "TPL-029")]
    [InlineData("Age", "age")]
    [InlineData("  AGE ", "age")]
    [InlineData("\tالاسم\n", "الاسم")]
    [InlineData("Full Name", "full name")]
    public void NameKey_is_the_name_trimmed_and_lower_cased(string name, string key)
    {
        PrescriptionLayoutRules.NameKey(name).ShouldBe(key);
    }

    // ---- The column's JSON ----

    [Fact]
    [Trait("Case", "TPL-002")]
    public void Serialize_writes_camelCase_and_leaves_out_the_null_strings()
    {
        var json = JsonNode.Parse(PrescriptionLayoutRules.Serialize(OnA5(
            PrescriptionText("t1"),
            Manual("م", "m1"),
            FunctionItem("time", "د", "f1"),
            StaticItem("ث", "s1"))));

        JsonNode.DeepEquals(json, JsonNode.Parse("""
            {
              "schemaVersion": 1,
              "page": { "size": "A5", "widthMm": 148, "heightMm": 210 },
              "items": [
                { "id": "t1", "kind": "prescriptionText", "xMm": 14, "yMm": 80, "wMm": 120, "hMm": 90, "fontSizePt": 11 },
                { "id": "m1", "kind": "manualInput", "name": "م", "xMm": 58, "yMm": 46, "wMm": 72, "hMm": 8, "fontSizePt": 11 },
                { "id": "f1", "kind": "function", "function": "time", "name": "د", "xMm": 14, "yMm": 46, "wMm": 30, "hMm": 8, "fontSizePt": 11 },
                { "id": "s1", "kind": "staticText", "text": "ث", "xMm": 14, "yMm": 175, "wMm": 60, "hMm": 8, "fontSizePt": 11 }
              ]
            }
            """)).ShouldBeTrue(json.ToJsonString());
    }

    [Fact]
    [Trait("Case", "TPL-002")]
    public void Deserialize_reads_what_Serialize_wrote_order_and_text_included()
    {
        var layout = Layout(Custom(210.1m, 300),
            StaticItem("سطر\r\nسطر\t«آخر» \"x\"", "z", xMm: 1.5m),
            PrescriptionText("a", yMm: 0.1m),
            FunctionItem("pageNumber", "رقم", "m"),
            Manual("الاسم", "b", fontSizePt: 36));

        var read = PrescriptionLayoutRules.Deserialize(PrescriptionLayoutRules.Serialize(layout));

        read.SchemaVersion.ShouldBe(1);
        read.Page.ShouldBe(layout.Page);
        read.Items.ShouldBe(layout.Items);
    }

    [Fact]
    [Trait("Case", "TPL-002")]
    public void Deserialize_reads_camelCase_properties()
    {
        var read = PrescriptionLayoutRules.Deserialize("""
            { "schemaVersion": 1, "page": { "size": "A4", "widthMm": 210.0, "heightMm": 297.0 },
              "items": [ { "id": "t1", "kind": "prescriptionText", "xMm": 1.5, "yMm": 2.5, "wMm": 30.0, "hMm": 40.0, "fontSizePt": 12.0 } ] }
            """);

        read.Page.ShouldBe(new PrescriptionPageDto("A4", 210, 297));
        read.Items.ShouldBe([new PrescriptionItemDto("t1", "prescriptionText", null, null, null, 1.5m, 2.5m, 30, 40, 12)]);
    }
}
