using System.Net;
using System.Text.Json.Nodes;
using ClinicHub.Application.Features.Prescriptions.Templates;
using ClinicHub.IntegrationTests.Harness.Assertions;
using ClinicHub.IntegrationTests.Harness.Clients;
using ClinicHub.IntegrationTests.Harness.Hosting;
using Shouldly;
using static ClinicHub.IntegrationTests.Admin.PrescriptionTemplates.LayoutBuilder;

namespace ClinicHub.IntegrationTests.Admin.PrescriptionTemplates;

/// <summary>
/// An item's horizontal alignment through the real routes (step 4 contract § 4.3.2): stored and answered as sent, missing or null is no alignment, which
/// reads as right, and a bad value or a wrong type is refused. The rule itself runs in the unit tests and on every row of the shared fixture.
/// </summary>
[Collection(AdminCollection7.Name)]
[Trait("Area", "admin")]
public class TemplateAlignApiTests(AppFixture app) : IntegrationTest(app)
{
    private const string ClinicRoute = "/api/v1/prescription-template";
    private const string Page = """{ "size": "A5", "widthMm": 148, "heightMm": 210 }""";
    private const string TextBox = """ "id": "t1", "kind": "prescriptionText", "xMm": 14, "yMm": 80, "wMm": 120, "hMm": 90, "fontSizePt": 11 """;

    private static readonly string[] Kinds = ["manualInput", "function", "staticText"];

    private static string Body(params string[] items) => $$"""{ "schemaVersion": 1, "page": {{Page}}, "items": [{{string.Join(", ", items)}}] }""";

    private static string TextItem(string extra = "") => $$"""{ {{TextBox}} {{extra}} }""";

    /// <summary>An item of this kind, with these raw properties after its own.</summary>
    private static string ItemOfKind(string kind, string extra = "") => kind switch
    {
        "manualInput" => $$"""{ "id": "m1", "kind": "manualInput", "name": "الاسم", "xMm": 58, "yMm": 46, "wMm": 72, "hMm": 8, "fontSizePt": 11 {{extra}} }""",
        "function" => $$"""{ "id": "f1", "kind": "function", "function": "fullDate", "name": "التاريخ", "xMm": 14, "yMm": 46, "wMm": 30, "hMm": 8, "fontSizePt": 11 {{extra}} }""",
        "staticText" => $$"""{ "id": "s1", "kind": "staticText", "text": "نص", "xMm": 14, "yMm": 175, "wMm": 60, "hMm": 8, "fontSizePt": 11 {{extra}} }""",
        _ => throw new ArgumentOutOfRangeException(nameof(kind), kind, null),
    };

    private static TheoryData<string, string> EachKindWith(params string[] values)
    {
        var data = new TheoryData<string, string>();
        foreach (var kind in Kinds)
            foreach (var value in values)
                data.Add(kind, value);
        return data;
    }

    /// <summary>A clinic holding a template with an alignment; the check says it's exactly as saved.</summary>
    private async Task<(ApiClient Admin, int ClinicId, Func<Task> NothingChanged)> ClinicWithAnAlignmentAsync()
    {
        var admin = await Login.SharedSuperAdminAsync();
        var clinic = await Data.Clinic();
        var layout = Layout(A5, Text(), Manual("السن", "a1") with { Align = "center" });
        await admin.SaveTemplateAsync(clinic.Id, layout);
        var row = await App.TemplateRowAsync(clinic.Id);
        Clock.Advance(TimeSpan.FromSeconds(1));
        return (admin, clinic.Id, async () =>
        {
            var after = await App.TemplateRowAsync(clinic.Id);
            after.Layout.ShouldBe(row.Layout);
            after.UpdatedAt.ShouldBe(row.UpdatedAt);
            (await admin.ReadTemplateAsync(clinic.Id)).Layout.ShouldMatch(layout);
        });
    }

    /// <summary>The items as the PUT answered them, as GET answers them, and as the row holds them.</summary>
    private async Task<IEnumerable<JsonArray>> ItemsEverywhereAsync(ApiClient admin, int clinicId, HttpResponseMessage put)
    {
        var answered = (await put.ReadNodeAsync())["layout"]["items"].AsArray();
        var read = (await (await admin.GetAsync(Route(clinicId))).ReadNodeAsync())["layout"]["items"].AsArray();
        var stored = JsonNode.Parse((await App.TemplateRowAsync(clinicId)).Layout)["items"].AsArray();
        return [answered, read, stored];
    }

    // ---- Stored and answered ----

    [Theory]
    [InlineData("right")]
    [InlineData("center")]
    [InlineData("left")]
    [Trait("Case", "TPL-739")]
    [Trait("Tier", "Smoke")]
    public async Task An_alignment_on_every_short_kind_is_stored_and_answered_by_every_route(string align)
    {
        var admin = await Login.SharedSuperAdminAsync();
        var clinic = await Data.Clinic();
        var layout = Layout(A5, Text(), Manual("الاسم") with { Align = align }, FullDate("التاريخ") with { Align = align }, Static("نص") with { Align = align });

        var put = await admin.PutTemplateAsync(clinic.Id, layout);

        await put.ShouldBeOkAsync();
        (await put.ReadAsync<PrescriptionTemplateDto>()).Layout.ShouldMatch(layout);
        (await admin.ReadTemplateAsync(clinic.Id)).Layout.ShouldMatch(layout);
        var own = await (await Login.OwnerAsync(clinic)).GetAsync(ClinicRoute);
        await own.ShouldBeOkAsync();
        (await own.ReadAsync<PrescriptionTemplateDto>()).Layout.ShouldMatch(layout);
        foreach (var items in await ItemsEverywhereAsync(admin, clinic.Id, put))
        {
            items[0].AsObject().ContainsKey("align").ShouldBeFalse();
            foreach (var index in new[] { 1, 2, 3 })
                ((string)items[index]["align"]).ShouldBe(align);
        }
    }

    [Fact]
    [Trait("Case", "TPL-739")]
    public async Task An_alignment_changed_by_a_second_PUT_replaces_the_first()
    {
        var admin = await Login.SharedSuperAdminAsync();
        var clinic = await Data.Clinic();
        await admin.SaveTemplateAsync(clinic.Id, Layout(A5, Text(), Manual("الاسم") with { Align = "center" }));
        var second = Layout(A5, Text(), Manual("الاسم") with { Align = "left" });

        var saved = await admin.SaveTemplateAsync(clinic.Id, second);

        saved.Layout.ShouldMatch(second);
        (await admin.ReadTemplateAsync(clinic.Id)).Layout.ShouldMatch(second);
        ((string)JsonNode.Parse((await App.TemplateRowAsync(clinic.Id)).Layout)["items"][1]["align"]).ShouldBe("left");
    }

    [Fact]
    [Trait("Case", "TPL-739")]
    [Trait("Case", "TPL-002")]
    public async Task An_alignment_adds_only_its_own_key_and_the_schema_version_stays_1()
    {
        var admin = await Login.SharedSuperAdminAsync();
        var clinic = await Data.Clinic();

        var put = await admin.PutTemplateAsync(clinic.Id, Layout(A5, Text(), Manual("الاسم") with { Align = "center" }));
        await put.ShouldBeOkAsync();

        foreach (var items in await ItemsEverywhereAsync(admin, clinic.Id, put))
            items[1].AsObject().Select(p => p.Key).ShouldBe(["id", "kind", "name", "xMm", "yMm", "wMm", "hMm", "fontSizePt", "align"], ignoreOrder: true);
        ((int)JsonNode.Parse((await App.TemplateRowAsync(clinic.Id)).Layout)["schemaVersion"]).ShouldBe(1);
    }

    // ---- Missing or null ----

    public static TheoryData<string, string> MissingOrNull => EachKindWith("", """, "align": null""");

    [Theory]
    [MemberData(nameof(MissingOrNull))]
    [Trait("Case", "TPL-739")]
    public async Task A_missing_or_null_alignment_saves_and_reads_as_none_which_is_right_and_clears_a_stored_one(string kind, string align)
    {
        var (admin, clinicId, _) = await ClinicWithAnAlignmentAsync();

        var put = await admin.PutRawTemplateAsync(clinicId, Body(TextItem(), ItemOfKind(kind, align)));

        await put.ShouldBeOkAsync();
        (await admin.ReadTemplateAsync(clinicId)).Layout.Items[1].Align.ShouldBeNull();
        foreach (var items in await ItemsEverywhereAsync(admin, clinicId, put))
            items[1].AsObject().ContainsKey("align").ShouldBeFalse();
    }

    [Fact]
    [Trait("Case", "TPL-739")]
    public async Task A_row_saved_before_the_alignment_is_answered_with_none_and_needs_no_data_step()
    {
        var admin = await Login.SharedSuperAdminAsync();
        var clinic = await Data.Clinic();
        await admin.SaveTemplateAsync(clinic.Id, L());
        const string raw = """{"schemaVersion":1,"page":{"size":"A5","widthMm":148,"heightMm":210},"items":[{"id":"t1","kind":"prescriptionText","xMm":14,"yMm":80,"wMm":120,"hMm":90,"fontSizePt":11},{"id":"m1","kind":"manualInput","name":"الاسم","xMm":58,"yMm":46,"wMm":72,"hMm":8,"fontSizePt":11}],"calibration":{"xMm":0,"yMm":0}}""";
        await App.SaveRawLayoutAsync(clinic.Id, raw);

        var read = await admin.ReadTemplateAsync(clinic.Id);

        read.Layout.Items.ShouldAllBe(item => item.Align == null);
        var answered = (await (await admin.GetAsync(Route(clinic.Id))).ReadNodeAsync())["layout"]["items"].AsArray();
        answered[1].AsObject().ContainsKey("align").ShouldBeFalse();
        (await App.TemplateRowAsync(clinic.Id)).Layout.ShouldBe(raw, "reading rewrites nothing");
    }

    // ---- The prescription text's ----

    [Theory]
    [InlineData("center")]
    [InlineData("Center")]
    [Trait("Case", "TPL-739")]
    public async Task The_prescription_texts_alignment_is_neither_answered_nor_stored(string align)
    {
        var admin = await Login.SharedSuperAdminAsync();
        var clinic = await Data.Clinic();

        var put = await admin.PutRawTemplateAsync(clinic.Id, Body(TextItem($$""", "align": "{{align}}" """)));

        await put.ShouldBeOkAsync();
        foreach (var items in await ItemsEverywhereAsync(admin, clinic.Id, put))
            items[0].AsObject().ContainsKey("align").ShouldBeFalse();
    }

    // ---- Refused ----

    public static TheoryData<string, string> BadValues => EachKindWith("Center", "RIGHT", "Left", "justify", "start", "", " right");

    [Theory]
    [MemberData(nameof(BadValues))]
    [Trait("Case", "TPL-739")]
    public async Task A_bad_value_is_templateLayoutInvalid_on_the_items_align_and_replaces_nothing(string kind, string align)
    {
        var (admin, clinicId, nothingChanged) = await ClinicWithAnAlignmentAsync();

        var problem = await (await admin.PutRawTemplateAsync(clinicId, Body(TextItem(), ItemOfKind(kind, $$""", "align": "{{align}}" """))))
            .ShouldBeProblemAsync(HttpStatusCode.BadRequest, "templateLayoutInvalid");

        problem.Errors.Select(e => (e.Field, e.Code)).ShouldBe([("items[1].align", "templateLayoutInvalid")]);
        await nothingChanged();
    }

    public static TheoryData<string, string> WrongTypes
    {
        get
        {
            var data = new TheoryData<string, string>();
            foreach (var value in new[] { "5", "1.5", "true", "false", "[]", """["right"]""", "{}", """{ "value": "right" }""" })
            {
                data.Add("items[1].align", Body(TextItem(), ItemOfKind("manualInput", $""", "align": {value} """)));
                data.Add("items[1].align", Body(TextItem(), ItemOfKind("function", $""", "align": {value} """)));
                data.Add("items[1].align", Body(TextItem(), ItemOfKind("staticText", $""", "align": {value} """)));
                data.Add("items[0].align", Body(TextItem($""", "align": {value} """)));
            }

            return data;
        }
    }

    [Theory]
    [MemberData(nameof(WrongTypes))]
    [Trait("Case", "TPL-739")]
    public async Task A_wrong_type_is_invalidRequest_naming_it_and_replaces_nothing(string field, string body)
    {
        var (admin, clinicId, nothingChanged) = await ClinicWithAnAlignmentAsync();

        var problem = await (await admin.PutRawTemplateAsync(clinicId, body)).ShouldBeProblemAsync(HttpStatusCode.BadRequest, "invalidRequest");

        problem.ShouldHaveError(field, "invalidRequest");
        problem.Errors.ShouldAllBe(e => e.Code == "invalidRequest");
        await nothingChanged();
    }
}
