using System.Net;
using ClinicHub.Application.Features.Prescriptions.Templates;
using ClinicHub.IntegrationTests.Harness.Assertions;
using ClinicHub.IntegrationTests.Harness.Hosting;
using Shouldly;
using static ClinicHub.IntegrationTests.Admin.PrescriptionTemplates.LayoutBuilder;

namespace ClinicHub.IntegrationTests.Admin.PrescriptionTemplates;

/// <summary>
/// The borders of contract § 1.4 that the shared fixture has no row for, through HTTP: the camelCase of the real answer
/// and the rounding before validation. The unit tests prove the same rules one by one; these also carry the rules' score
/// when only the <c>admin</c> integration tests run against mutants (<c>./ci.ps1 -Mutate … -Area admin</c>).
/// </summary>
[Collection(AdminCollection7.Name)]
[Trait("Area", "admin")]
public class TemplateRuleEdgeTests(AppFixture app) : IntegrationTest(app)
{
    private static readonly PrescriptionItemDto SmallText = Text(xMm: 0, yMm: 0, wMm: 10, hMm: 20);

    private static (string, string)[] Errors(params (string Field, string Code)[] errors) => [.. errors.Select(e => (e.Field, e.Code))];

    private static readonly Dictionary<string, (PrescriptionLayoutDto Layout, (string Field, string Code)[] Errors)> Rows = new()
    {
        // Rules 1–5: schema version and page
        ["a null schema version"] = (L() with { SchemaVersion = null }, Errors(("schemaVersion", "templateLayoutInvalid"))),
        ["schema version 0"] = (L() with { SchemaVersion = 0 }, Errors(("schemaVersion", "templateLayoutInvalid"))),
        ["a null page skips outside"] = (new(1, null, [Text(xMm: 500)]), Errors(("page", "invalidRequest"))),
        ["a lower-case size"] = (Layout(new("a5", 148, 210), Text()), Errors(("page.size", "templatePageInvalid"))),
        ["A4 in another case"] = (Layout(new("a4", 210, 297), Text()), Errors(("page.size", "templatePageInvalid"))),
        ["Custom in another case"] = (Layout(new("Custom", 100, 100), SmallText), Errors(("page.size", "templatePageInvalid"))),
        ["an unknown size skips measures and outside"] = (Layout(new("B5", null, 9999), Text(xMm: 500)), Errors(("page.size", "templatePageInvalid"))),
        ["both measures missing"] = (Layout(new("custom", null, null), SmallText), Errors(("page.widthMm", "invalidRequest"), ("page.heightMm", "invalidRequest"))),
        ["missing before wrong"] = (Layout(new("A5", 150, null), SmallText), Errors(("page.heightMm", "invalidRequest"), ("page.widthMm", "templatePageInvalid"))),
        ["A4 width off"] = (Layout(new("A4", 210.1m, 297), SmallText), Errors(("page.widthMm", "templatePageInvalid"))),
        ["A4 height off"] = (Layout(new("A4", 210, 296.9m), SmallText), Errors(("page.heightMm", "templatePageInvalid"))),
        ["A5 rounded to its measures"] = (Layout(new("A5", 147.96m, 210.04m), SmallText), Errors()),
        ["custom just under the width"] = (Layout(Custom(49.94m, 100), SmallText), Errors(("page.widthMm", "templatePageInvalid"))),
        ["custom rounded to the least width"] = (Layout(Custom(49.95m, 100), SmallText), Errors()),
        ["custom at the most width"] = (Layout(Custom(420.04m, 100), SmallText), Errors()),
        ["custom just over the width"] = (Layout(Custom(420.05m, 100), SmallText), Errors(("page.widthMm", "templatePageInvalid"))),
        ["custom just under the height"] = (Layout(Custom(100, 49.94m), SmallText), Errors(("page.heightMm", "templatePageInvalid"))),
        ["custom rounded to the least height"] = (Layout(Custom(100, 49.95m), SmallText), Errors()),
        ["custom at the most height"] = (Layout(Custom(100, 600.04m), SmallText), Errors()),
        ["custom just over the height"] = (Layout(Custom(100, 600.05m), SmallText), Errors(("page.heightMm", "templatePageInvalid"))),
        ["a failed page skips outside, not sizes"] = (Layout(new("A5", 150, 210), Text(xMm: -5, yMm: -5, wMm: 1, hMm: 1, fontSizePt: 1)),
            Errors(("page.widthMm", "templatePageInvalid"), ("items[0].wMm", "templateItemSizeInvalid"), ("items[0].hMm", "templateItemSizeInvalid"), ("items[0].fontSizePt", "templateFontSizeInvalid"))),
        ["a missing measure skips outside"] = (Layout(new("A5", null, 210), Text(xMm: 500, yMm: 500)), Errors(("page.widthMm", "invalidRequest"))),

        // Rules 6–8: counts and elements
        ["51 items answer the schema version and page too"] = (Layout(new("A5", 150, 210), [Text(), .. ManyManual(50)]) with { SchemaVersion = 2 },
            Errors(("schemaVersion", "templateLayoutInvalid"), ("page.widthMm", "templatePageInvalid"), ("items", "templateTooManyItems"))),
        ["51 items with no text"] = (Layout(A5, ManyManual(51)), Errors(("items", "templateTooManyItems"))),
        ["null items"] = (new(1, A5, null), Errors(("items", "templateTextCount"))),
        ["a null element"] = (Layout(A5, Text(), null), Errors(("items[1]", "templateLayoutInvalid"))),
        ["only a null element"] = (Layout(A5, [null]), Errors(("items", "templateTextCount"), ("items[0]", "templateLayoutInvalid"))),
        ["a null element before others"] = (Layout(A5, null, Text(), Manual("", "m1")), Errors(("items[0]", "templateLayoutInvalid"), ("items[2].name", "nameRequired"))),
        ["the text's kind in another case"] = (Layout(A5, Text() with { Kind = "PrescriptionText" }), Errors(("items", "templateTextCount"), ("items[0].kind", "templateLayoutInvalid"))),

        // 8a–8c: id, kind, function
        ["an id with a trailing line break"] = (Layout(A5, Text("a\n")), Errors(("items[0].id", "templateLayoutInvalid"))),
        ["an id of Arabic digits"] = (Layout(A5, Text("١")), Errors(("items[0].id", "templateLayoutInvalid"))),
        ["an id with a dot"] = (Layout(A5, Text("a.b")), Errors(("items[0].id", "templateLayoutInvalid"))),
        ["an id with every allowed character"] = (Layout(A5, Text("azAZ09_-")), Errors()),
        ["ids in two cases are two ids"] = (Layout(A5, Text("a1"), Manual("الاسم", "A1")), Errors()),
        ["an id repeated twice refuses both later items"] = (Layout(A5, Text("x"), Manual("الاسم", "x"), Manual("السن", "y"), Manual("الوزن", "x")),
            Errors(("items[1].id", "templateLayoutInvalid"), ("items[3].id", "templateLayoutInvalid"))),
        ["a malformed id twice is one error each"] = (Layout(A5, Text("a b"), Manual("الاسم", "a b")), Errors(("items[0].id", "templateLayoutInvalid"), ("items[1].id", "templateLayoutInvalid"))),
        ["two missing ids"] = (Layout(A5, Text(null), Manual("الاسم", null)), Errors(("items[0].id", "templateLayoutInvalid"), ("items[1].id", "templateLayoutInvalid"))),
        ["a null kind skips the item's rules"] = (Layout(A5, Text(), new PrescriptionItemDto("x1", null, "nope", "", "", -5, -5, 1, 1, 1)), Errors(("items[1].kind", "templateLayoutInvalid"))),
        ["an unknown kind keeps the id rule"] = (Layout(A5, Text(), new PrescriptionItemDto("", "manualinput", null, null, null, -5, null, null, null, null)), Errors(("items[1].id", "templateLayoutInvalid"), ("items[1].kind", "templateLayoutInvalid"))),
        ["a function in another case"] = (Layout(A5, Text(), Function("FullDate", "التاريخ")), Errors(("items[1].function", "templateLayoutInvalid"))),
        ["a null function"] = (Layout(A5, Text(), Function(null, "التاريخ")), Errors(("items[1].function", "templateLayoutInvalid"))),
        ["other kinds' fields aren't validated"] = (Layout(A5,
            Text() with { Function = "nope", Name = "", Text = "" },
            Manual("الاسم") with { Function = "nope", Text = "" },
            FullDate("التاريخ") with { Text = "" },
            Static("نص") with { Function = "nope", Name = "" }), Errors()),
        ["other kinds' names take no name"] = (Layout(A5, Text() with { Name = "الاسم" }, Static("نص") with { Name = "الاسم" }, Manual("الاسم")), Errors()),

        // 8d, 8e: names
        ["a function with a null name"] = (Layout(A5, Text(), Function("time", null)), Errors(("items[1].name", "nameRequired"))),
        ["a name of tabs"] = (Layout(A5, Text(), Manual("\t \t")), Errors(("items[1].name", "nameRequired"))),
        ["a name with a line separator"] = (Layout(A5, Text(), Manual("اسم\u2028آخر")), Errors(("items[1].name", "nameInvalid"))),
        ["a function name with a bidi isolate"] = (Layout(A5, Text(), Function("time", "اسم\u2066آخر")), Errors(("items[1].name", "nameInvalid"))),
        ["a function name of 61"] = (Layout(A5, Text(), Function("time", new string('ن', 61))), Errors(("items[1].name", "nameTooLong"))),
        ["a name of 61 with spaces"] = (Layout(A5, Text(), Manual($"  {new string('ن', 61)}  ")), Errors(("items[1].name", "nameTooLong"))),
        ["a refused character and the length"] = (Layout(A5, Text(), Manual(new string('ن', 60) + "\u202E")), Errors(("items[1].name", "nameInvalid"), ("items[1].name", "nameTooLong"))),
        ["function then manual share names"] = (Layout(A5, Text(), Function("time", "AGE"), Manual(" age ")), Errors(("items[2].name", "templateItemNameTaken"))),
        ["two functions share names"] = (Layout(A5, Text(), Function("time", "age", "f1"), Function("fullDate", "Age", "f2")), Errors(("items[2].name", "templateItemNameTaken"))),
        ["every later repeat is refused"] = (Layout(A5, Text(), Manual("السن", "m1"), Manual("الاسم", "m2"), Function("time", "السن", "f1"), Manual("السن", "m3")),
            Errors(("items[3].name", "templateItemNameTaken"), ("items[4].name", "templateItemNameTaken"))),
        ["a static text before a name takes nothing"] = (Layout(A5, Text(), Static("الاسم"), Manual("الاسم"), Static("الاسم", "s2")), Errors()),
        ["blank names never repeat"] = (Layout(A5, Text(), Manual("", "m1"), Manual("  ", "m2")), Errors(("items[1].name", "nameRequired"), ("items[2].name", "nameRequired"))),
        ["a null name before another name"] = (Layout(A5, Manual(null, "m1"), Manual("الاسم", "m2"), Text()), Errors(("items[0].name", "nameRequired"))),
        ["a refused name still counts as taken"] = (Layout(A5, Text(), Manual(new string('ن', 61), "m1"), Manual(new string('ن', 61), "m2")),
            Errors(("items[1].name", "nameTooLong"), ("items[2].name", "nameTooLong"), ("items[2].name", "templateItemNameTaken"))),

        // 8f–8h: static text
        ["a null static text"] = (Layout(A5, Text(), Static(null)), Errors(("items[1].text", "templateStaticTextRequired"))),
        ["a static text of line breaks"] = (Layout(A5, Text(), Static("\r\n\n")), Errors(("items[1].text", "templateStaticTextRequired"))),
        ["a static text of a zero-width space"] = (Layout(A5, Text(), Static("\u200B")), Errors(("items[1].text", "templateStaticTextRequired"))),
        ["a static text with U+2029"] = (Layout(A5, Text(), Static("نص\u2029نص")), Errors(("items[1].text", "invalidText"))),
        ["a static text with an isolate"] = (Layout(A5, Text(), Static("نص\u2069نص")), Errors(("items[1].text", "invalidText"))),
        ["a static text with a right-to-left mark"] = (Layout(A5, Text(), Static("نص\u200Fنص")), Errors()),
        ["\\r\\n counts 2: 1000"] = (Layout(A5, Text(), Static(new string('ن', 998) + "\r\n")), Errors()),
        ["\\r\\n counts 2: 1001"] = (Layout(A5, Text(), Static(new string('ن', 999) + "\r\n")), Errors(("items[1].text", "templateStaticTextTooLong"))),
        ["spaces count: 1000"] = (Layout(A5, Text(), Static(" " + new string('ن', 998) + " ")), Errors()),
        ["spaces count: 1001"] = (Layout(A5, Text(), Static(" " + new string('ن', 1000))), Errors(("items[1].text", "templateStaticTextTooLong"))),
        ["a refused character before the length"] = (Layout(A5, Text(), Static(new string('ن', 1000) + "\u202E")), Errors(("items[1].text", "invalidText"), ("items[1].text", "templateStaticTextTooLong"))),

        // 8i, 8j: box
        ["every number missing"] = (Layout(A5, Text() with { XMm = null, YMm = null, WMm = null, HMm = null, FontSizePt = null }),
            Errors(("items[0].xMm", "invalidRequest"), ("items[0].yMm", "invalidRequest"), ("items[0].wMm", "invalidRequest"), ("items[0].hMm", "invalidRequest"), ("items[0].fontSizePt", "invalidRequest"))),
        ["no width at the edge fits"] = (Layout(A5, Text(xMm: 148) with { WMm = null }), Errors(("items[0].wMm", "invalidRequest"))),
        ["no width past the edge"] = (Layout(A5, Text(xMm: 148.1m) with { WMm = null }), Errors(("items[0].xMm", "templateItemOutsidePage"), ("items[0].wMm", "invalidRequest"))),
        ["no height at the edge fits"] = (Layout(A5, Text(yMm: 210) with { HMm = null }), Errors(("items[0].hMm", "invalidRequest"))),
        ["no height past the edge"] = (Layout(A5, Text(yMm: 210.1m) with { HMm = null }), Errors(("items[0].yMm", "templateItemOutsidePage"), ("items[0].hMm", "invalidRequest"))),
        ["a missing X on a failed page"] = (Layout(new("A5", 150, 210), Text(yMm: 500) with { XMm = null }), Errors(("page.widthMm", "templatePageInvalid"), ("items[0].xMm", "invalidRequest"))),
        ["A4's edges pass"] = (Layout(A4, Text(xMm: 90, yMm: 207)), Errors()),
        ["past A4's right edge"] = (Layout(A4, Text(xMm: 90.1m, yMm: 207)), Errors(("items[0].xMm", "templateItemOutsidePage"))),
        ["past A4's bottom edge"] = (Layout(A4, Text(xMm: 90, yMm: 207.1m)), Errors(("items[0].yMm", "templateItemOutsidePage"))),
        ["an item filling the sheet"] = (Layout(A5, Text(xMm: 0, yMm: 0, wMm: 148, hMm: 210)), Errors()),
        ["taller than the sheet names Y"] = (Layout(A5, Text(yMm: 0, hMm: 210.1m)), Errors(("items[0].yMm", "templateItemOutsidePage"))),
        ["outside on both axes"] = (Layout(A5, Text(xMm: 100, yMm: 200)), Errors(("items[0].xMm", "templateItemOutsidePage"), ("items[0].yMm", "templateItemOutsidePage"))),
        ["a negative that rounds to 0"] = (Layout(A5, Text(xMm: -0.04m, yMm: -0.04m)), Errors()),
        ["a negative that rounds to -0.1"] = (Layout(A5, Text(xMm: -0.05m)), Errors(("items[0].xMm", "templateItemOutsidePage"))),
        ["a negative height at the edge"] = (Layout(A5, Text(), Manual("الاسم", yMm: 210, hMm: -5)), Errors(("items[1].hMm", "templateItemSizeInvalid"))),
        ["huge values don't overflow"] = (Layout(A5, Text(xMm: decimal.MaxValue, wMm: decimal.MaxValue)), Errors(("items[0].xMm", "templateItemOutsidePage"))),
        ["huge values on Y"] = (Layout(A5, Text(yMm: decimal.MaxValue, hMm: decimal.MaxValue)), Errors(("items[0].yMm", "templateItemOutsidePage"))),
        ["a manual input may be 4 high"] = (Layout(A5, Text(), Manual("الاسم", hMm: 4)), Errors()),
        ["a function 3.9 high"] = (Layout(A5, Text(), Function("time", "الوقت", hMm: 3.9m)), Errors(("items[1].hMm", "templateItemSizeInvalid"))),
        ["a static text 4.9 wide"] = (Layout(A5, Text(), Static("نص", wMm: 4.9m)), Errors(("items[1].wMm", "templateItemSizeInvalid"))),
        ["a font rounded to 6"] = (Layout(A5, Text(fontSizePt: 5.95m)), Errors()),
        ["a font rounded to 5.9"] = (Layout(A5, Text(fontSizePt: 5.94m)), Errors(("items[0].fontSizePt", "templateFontSizeInvalid"))),
        ["a static font of 36.1"] = (Layout(A5, Text(), Static("نص", fontSizePt: 36.1m)), Errors(("items[1].fontSizePt", "templateFontSizeInvalid"))),
        ["the text's height rounded to 20"] = (Layout(A5, Text(hMm: 19.95m)), Errors()),
        ["the text's height rounded to 19.9"] = (Layout(A5, Text(hMm: 19.94m)), Errors(("items[0].hMm", "templateItemSizeInvalid"))),
        ["a function's errors in order"] = (Layout(A5, Text(), Function("nope", "", "bad id", xMm: 500, yMm: 500, wMm: 1, hMm: 1, fontSizePt: 1)),
            Errors(("items[1].id", "templateLayoutInvalid"), ("items[1].function", "templateLayoutInvalid"), ("items[1].name", "nameRequired"), ("items[1].xMm", "templateItemOutsidePage"),
                ("items[1].yMm", "templateItemOutsidePage"), ("items[1].wMm", "templateItemSizeInvalid"), ("items[1].hMm", "templateItemSizeInvalid"), ("items[1].fontSizePt", "templateFontSizeInvalid"))),
        ["a sum exact on the vertical axis"] = (Layout(Custom(200, 210.1m), Text(yMm: 0.3m, hMm: 209.8m)), Errors()),
        ["a sum refused on the vertical axis"] = (Layout(Custom(200, 210.1m), Text(yMm: 0.4m, hMm: 209.8m)), Errors(("items[0].yMm", "templateItemOutsidePage"))),
    };

    public static TheoryData<string> RowNames => new(Rows.Keys);

    [Theory]
    [MemberData(nameof(RowNames))]
    [Trait("Case", "TPL-048")]
    public async Task The_API_answers_exactly_the_errors_of_the_rule_table(string name)
    {
        var admin = await Login.SharedSuperAdminAsync();
        var clinic = await App.PerClassAsync("template:clinic", () => Data.Clinic().CreateAsync());
        var (layout, errors) = Rows[name];

        var response = await admin.PutTemplateAsync(clinic.Id, layout);

        if (errors.Length == 0)
        {
            await response.ShouldBeOkAsync();
            return;
        }

        var problem = await response.ShouldBeProblemAsync(HttpStatusCode.BadRequest, errors[0].Code);
        problem.Errors.Select(e => (e.Field, e.Code)).ShouldBe(errors.Select(e => (e.Field, e.Code)));
    }
}
