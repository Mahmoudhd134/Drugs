using System.Net;
using ClinicHub.Application.Common.Results;
using ClinicHub.IntegrationTests.Harness.Assertions;
using ClinicHub.IntegrationTests.Harness.Builders;
using ClinicHub.IntegrationTests.Harness.Clients;
using ClinicHub.IntegrationTests.Harness.Hosting;
using Shouldly;
using static ClinicHub.IntegrationTests.Admin.PrescriptionTemplates.LayoutBuilder;

namespace ClinicHub.IntegrationTests.Admin.PrescriptionTemplates;

/// <summary>
/// Bodies the records can't read or that leave a field out (contract § 1.2 "Types and binding"), sent as raw JSON. A body
/// that doesn't bind answers <c>invalidRequest</c> and isn't validated; a stored template stays as it was.
/// </summary>
[Collection(AdminCollection7.Name)]
[Trait("Area", "admin")]
public class TemplateBindingTests(AppFixture app) : IntegrationTest(app)
{
    private const string Page = """{ "size": "A5", "widthMm": 148, "heightMm": 210 }""";
    private const string TextItem = """{ "id": "t1", "kind": "prescriptionText", "xMm": 14, "yMm": 80, "wMm": 120, "hMm": 90, "fontSizePt": 11 }""";
    private const string ManualItem = """{ "id": "m1", "kind": "manualInput", "name": "الاسم", "xMm": 58, "yMm": 46, "wMm": 72, "hMm": 8, "fontSizePt": 11 }""";
    private const string FunctionItem = """{ "id": "f1", "kind": "function", "function": "fullDate", "name": "التاريخ", "xMm": 14, "yMm": 46, "wMm": 30, "hMm": 8, "fontSizePt": 11 }""";

    private static string Body(string items, string page = Page, string schemaVersion = "1") =>
        $$"""{ "schemaVersion": {{schemaVersion}}, "page": {{page}}, "items": {{items}} }""";

    private static string Items(params string[] items) => $"[{string.Join(", ", items)}]";

    /// <summary>A clinic for the class, holding a template; each call checks that it is exactly as saved.</summary>
    private async Task<(ApiClient Admin, int ClinicId, Func<Task> NothingChanged)> ClinicWithATemplateAsync()
    {
        var admin = await Login.SharedSuperAdminAsync();
        var clinic = await Data.Clinic();
        var layout = L();
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

    // ---- TPL-033: not a layout ----

    public static TheoryData<string> NotALayout => new()
    {
        "{bad json",
        """{ "schemaVersion": 1, "page": """,
        "",
        "null",
        "[]",
        "5",
        "\"layout\"",
    };

    [Theory]
    [MemberData(nameof(NotALayout))]
    [Trait("Case", "TPL-033")]
    public async Task A_body_that_isnt_a_layout_is_invalidRequest_and_nothing_is_stored(string body)
    {
        var admin = await Login.SharedSuperAdminAsync();
        var clinic = await Data.Clinic();

        var problem = await (await admin.PutRawTemplateAsync(clinic.Id, body)).ShouldBeProblemAsync(HttpStatusCode.BadRequest, "invalidRequest");

        problem.Errors.ShouldAllBe(e => e.Code == "invalidRequest");
        await admin.ShouldHaveNoTemplateAsync(clinic.Id);
    }

    [Fact]
    [Trait("Case", "TPL-033")]
    public async Task A_missing_page_is_invalidRequest_naming_page_and_a_null_one_too()
    {
        var admin = await Login.SharedSuperAdminAsync();
        var clinic = await Data.Clinic();

        foreach (var body in new[]
                 {
                     $$"""{ "schemaVersion": 1, "items": {{Items(TextItem)}} }""",
                     Body(Items(TextItem), page: "null"),
                 })
        {
            var problem = await (await admin.PutRawTemplateAsync(clinic.Id, body)).ShouldBeProblemAsync(HttpStatusCode.BadRequest, "invalidRequest");
            problem.Errors.Select(e => (e.Field, e.Code)).ShouldBe([("page", "invalidRequest")]);
        }

        await admin.ShouldHaveNoTemplateAsync(clinic.Id);
    }

    [Fact]
    [Trait("Case", "TPL-033")]
    public async Task A_malformed_body_replaces_nothing()
    {
        var (admin, clinicId, nothingChanged) = await ClinicWithATemplateAsync();

        await (await admin.PutRawTemplateAsync(clinicId, "{bad json")).ShouldBeProblemAsync(HttpStatusCode.BadRequest, "invalidRequest");

        await nothingChanged();
    }

    // ---- TPL-204: wrong types ----

    public static TheoryData<string, string> WrongTypes => new()
    {
        { "items[0].fontSizePt", Body(Items("""{ "id": "t1", "kind": "prescriptionText", "xMm": 14, "yMm": 80, "wMm": 120, "hMm": 90, "fontSizePt": "big" }""")) },
        { "items[1].xMm", Body(Items(TextItem, """{ "id": "m1", "kind": "manualInput", "name": "ن", "xMm": "a", "yMm": 46, "wMm": 72, "hMm": 8, "fontSizePt": 11 }""")) },
        { "items[0].yMm", Body(Items("""{ "id": "t1", "kind": "prescriptionText", "xMm": 14, "yMm": true, "wMm": 120, "hMm": 90, "fontSizePt": 11 }""")) },
        { "items[0].wMm", Body(Items("""{ "id": "t1", "kind": "prescriptionText", "xMm": 14, "yMm": 80, "wMm": [], "hMm": 90, "fontSizePt": 11 }""")) },
        { "items[0].hMm", Body(Items("""{ "id": "t1", "kind": "prescriptionText", "xMm": 14, "yMm": 80, "wMm": 120, "hMm": {}, "fontSizePt": 11 }""")) },
        { "items", Body("\"x\"") },
        { "page.widthMm", Body(Items(TextItem), page: """{ "size": "A5", "widthMm": "a", "heightMm": 210 }""") },
        { "page.heightMm", Body(Items(TextItem), page: """{ "size": "A5", "widthMm": 148, "heightMm": "a" }""") },
        { "schemaVersion", Body(Items(TextItem), schemaVersion: "1.5") },
        { "schemaVersion", Body(Items(TextItem), schemaVersion: "\"one\"") },
        { "items[0].kind", Body(Items("""{ "id": "t1", "kind": 5, "xMm": 14, "yMm": 80, "wMm": 120, "hMm": 90, "fontSizePt": 11 }""")) },
        { "items[0].xMm", Body(Items("""{ "id": "t1", "kind": "prescriptionText", "xMm": 1e30, "yMm": 80, "wMm": 120, "hMm": 90, "fontSizePt": 11 }""")) },
    };

    [Theory]
    [MemberData(nameof(WrongTypes))]
    [Trait("Case", "TPL-204")]
    public async Task A_wrong_type_is_invalidRequest_naming_the_field_and_a_stored_template_is_unchanged(string field, string body)
    {
        var (admin, clinicId, nothingChanged) = await ClinicWithATemplateAsync();

        var problem = await (await admin.PutRawTemplateAsync(clinicId, body)).ShouldBeProblemAsync(HttpStatusCode.BadRequest, "invalidRequest");

        problem.ShouldHaveError(field, "invalidRequest");
        problem.Errors.ShouldAllBe(e => e.Code == "invalidRequest");
        problem.Errors.ShouldAllBe(e => e.Description == CommonErrors.InvalidRequest.Description);
        await nothingChanged();
    }

    [Fact]
    [Trait("Case", "TPL-204")]
    public async Task A_body_that_doesnt_bind_isnt_validated()
    {
        var admin = await Login.SharedSuperAdminAsync();
        var clinic = await Data.Clinic();
        // Unknown schema version, wrong page, no prescription text: only the wrong type is answered
        var body = Body(Items("""{ "id": "", "kind": "manualInput", "name": "", "xMm": "a", "yMm": 46, "wMm": 72, "hMm": 8, "fontSizePt": 11 }"""),
            page: """{ "size": "B5", "widthMm": 1, "heightMm": 1 }""", schemaVersion: "2");

        var problem = await (await admin.PutRawTemplateAsync(clinic.Id, body)).ShouldBeProblemAsync(HttpStatusCode.BadRequest, "invalidRequest");

        problem.Errors.ShouldAllBe(e => e.Code == "invalidRequest");
        problem.ShouldHaveError("items[0].xMm", "invalidRequest");
    }

    [Fact]
    [Trait("Case", "TPL-204")]
    public async Task An_unknown_kind_string_stays_templateLayoutInvalid_not_a_binding_error()
    {
        var (admin, clinicId, nothingChanged) = await ClinicWithATemplateAsync();
        var body = Body(Items(TextItem, """{ "id": "x1", "kind": "qrCode", "xMm": 0, "yMm": 0, "wMm": 10, "hMm": 10, "fontSizePt": 11 }"""));

        var problem = await (await admin.PutRawTemplateAsync(clinicId, body)).ShouldBeProblemAsync(HttpStatusCode.BadRequest, "templateLayoutInvalid");

        problem.Errors.Select(e => (e.Field, e.Code)).ShouldBe([("items[1].kind", "templateLayoutInvalid")]);
        await nothingChanged();
    }

    // ---- Missing fields: the validator names them ----

    public static TheoryData<string, string, string> MissingFields => new()
    {
        { "schemaVersion", "templateLayoutInvalid", $$"""{ "page": {{Page}}, "items": {{Items(TextItem)}} }""" },
        { "schemaVersion", "templateLayoutInvalid", Body(Items(TextItem), schemaVersion: "null") },
        { "page.size", "templatePageInvalid", Body(Items(TextItem), page: """{ "widthMm": 148, "heightMm": 210 }""") },
        { "page.widthMm", "invalidRequest", Body(Items(TextItem), page: """{ "size": "A5", "heightMm": 210 }""") },
        { "page.heightMm", "invalidRequest", Body(Items(TextItem), page: """{ "size": "A5", "widthMm": 148, "heightMm": null }""") },
        { "items", "templateTextCount", $$"""{ "schemaVersion": 1, "page": {{Page}} }""" },
        { "items", "templateTextCount", Body("[]") },
        { "items", "templateTextCount", Body("null") },
        { "items[0].xMm", "invalidRequest", Body(Items("""{ "id": "t1", "kind": "prescriptionText", "yMm": 80, "wMm": 120, "hMm": 90, "fontSizePt": 11 }""")) },
        { "items[0].yMm", "invalidRequest", Body(Items("""{ "id": "t1", "kind": "prescriptionText", "xMm": 14, "yMm": null, "wMm": 120, "hMm": 90, "fontSizePt": 11 }""")) },
        { "items[0].wMm", "invalidRequest", Body(Items("""{ "id": "t1", "kind": "prescriptionText", "xMm": 14, "yMm": 80, "hMm": 90, "fontSizePt": 11 }""")) },
        { "items[0].hMm", "invalidRequest", Body(Items("""{ "id": "t1", "kind": "prescriptionText", "xMm": 14, "yMm": 80, "wMm": 120, "fontSizePt": 11 }""")) },
        { "items[0].fontSizePt", "invalidRequest", Body(Items("""{ "id": "t1", "kind": "prescriptionText", "xMm": 14, "yMm": 80, "wMm": 120, "hMm": 90 }""")) },
        { "items[0].id", "templateLayoutInvalid", Body(Items("""{ "kind": "prescriptionText", "xMm": 14, "yMm": 80, "wMm": 120, "hMm": 90, "fontSizePt": 11 }""")) },
        { "items[1].kind", "templateLayoutInvalid", Body(Items(TextItem, """{ "id": "x1", "xMm": 14, "yMm": 80, "wMm": 120, "hMm": 90, "fontSizePt": 11 }""")) },
        { "items[1].function", "templateLayoutInvalid", Body(Items(TextItem, """{ "id": "f1", "kind": "function", "name": "ن", "xMm": 14, "yMm": 46, "wMm": 30, "hMm": 8, "fontSizePt": 11 }""")) },
        { "items[1].name", "nameRequired", Body(Items(TextItem, """{ "id": "m1", "kind": "manualInput", "xMm": 58, "yMm": 46, "wMm": 72, "hMm": 8, "fontSizePt": 11 }""")) },
        { "items[1].text", "templateStaticTextRequired", Body(Items(TextItem, """{ "id": "s1", "kind": "staticText", "xMm": 14, "yMm": 175, "wMm": 60, "hMm": 8, "fontSizePt": 11 }""")) },
        { "items[1]", "templateLayoutInvalid", Body(Items(TextItem, "null")) },
    };

    [Theory]
    [MemberData(nameof(MissingFields))]
    [Trait("Case", "TPL-214")]
    public async Task A_missing_field_is_its_rules_one_error_naming_it(string field, string code, string body)
    {
        var (admin, clinicId, nothingChanged) = await ClinicWithATemplateAsync();

        var problem = await (await admin.PutRawTemplateAsync(clinicId, body)).ShouldBeProblemAsync(HttpStatusCode.BadRequest, code);

        problem.Errors.Select(e => (e.Field, e.Code)).ShouldBe([(field, code)]);
        await nothingChanged();
    }

    [Fact]
    [Trait("Case", "TPL-002")]
    public async Task The_body_of_the_contracts_example_is_saved()
    {
        var admin = await Login.SharedSuperAdminAsync();
        var clinic = await Data.Clinic();
        var body = Body(Items(TextItem, ManualItem, FunctionItem,
            """{ "id": "i4", "kind": "staticText", "text": "يُصرف مرة واحدة\nسطر ثان", "xMm": 14, "yMm": 175, "wMm": 60, "hMm": 8, "fontSizePt": 10 }"""));

        await (await admin.PutRawTemplateAsync(clinic.Id, body)).ShouldBeOkAsync();

        var read = await admin.ReadTemplateAsync(clinic.Id);
        read.Layout.Page.ShouldBe(A5);
        read.Layout.Items.ShouldBe([Text(), Manual("الاسم"), FullDate("التاريخ"), Static("يُصرف مرة واحدة\nسطر ثان", "i4", fontSizePt: 10)]);
    }
}
