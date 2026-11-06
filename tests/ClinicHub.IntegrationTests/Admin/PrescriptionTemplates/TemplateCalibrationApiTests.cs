using System.Net;
using System.Text.Json;
using System.Text.Json.Nodes;
using ClinicHub.Application.Common.Results;
using ClinicHub.Application.Features.Prescriptions.Templates;
using ClinicHub.IntegrationTests.Harness.Assertions;
using ClinicHub.IntegrationTests.Harness.Clients;
using ClinicHub.IntegrationTests.Harness.Hosting;
using Shouldly;
using static ClinicHub.IntegrationTests.Admin.PrescriptionTemplates.LayoutBuilder;

namespace ClinicHub.IntegrationTests.Admin.PrescriptionTemplates;

/// <summary>
/// The printer's correction through the real routes (step 4 design § 4): what a row saved before this step answers, what an older tab's Save does,
/// and what binding refuses. The rules themselves run in the unit tests and on every row of the shared fixture.
/// </summary>
[Collection(AdminCollection7.Name)]
[Trait("Area", "admin")]
public class TemplateCalibrationApiTests(AppFixture app) : IntegrationTest(app)
{
    private const string ClinicRoute = "/api/v1/prescription-template";
    private const string Before = """{ "schemaVersion": 1, "page": { "size": "A5", "widthMm": 148, "heightMm": 210 }, "items": [ { "id": "t1", "kind": "prescriptionText", "xMm": 14, "yMm": 80, "wMm": 120, "hMm": 90, "fontSizePt": 11 } ]""";

    private static readonly PrescriptionCalibrationDto None = new(0, 0);

    /// <summary>A body with no calibration key.</summary>
    private static string BodyWithNoCalibration => $"{Before} }}";

    /// <summary>A body with this raw value for <c>calibration</c>.</summary>
    private static string BodyWith(string calibration) => $$"""{{Before}}, "calibration": {{calibration}} }""";

    /// <summary>A clinic holding a template with a correction; the check says the row is exactly as saved.</summary>
    private async Task<(ApiClient Admin, int ClinicId, Func<Task> NothingChanged)> ClinicWithACorrectionAsync()
    {
        var admin = await Login.SharedSuperAdminAsync();
        var clinic = await Data.Clinic();
        var layout = L().WithCalibration(2, -1.5m);
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

    private static async Task<PrescriptionTemplateDto> ReadOwnAsync(ApiClient client)
    {
        var response = await client.GetAsync(ClinicRoute);
        await response.ShouldBeOkAsync();
        return await response.ReadAsync<PrescriptionTemplateDto>();
    }

    // ---- TPL-002: saved and read back ----

    [Fact]
    [Trait("Case", "TPL-002")]
    public async Task A_calibration_is_saved_and_answered_by_both_routes()
    {
        var admin = await Login.SharedSuperAdminAsync();
        var clinic = await Data.Clinic();
        var layout = L().WithCalibration(2, -1.5m);

        var saved = await admin.SaveTemplateAsync(clinic.Id, layout);

        saved.Layout.ShouldMatch(layout);
        (await admin.ReadTemplateAsync(clinic.Id)).Layout.ShouldMatch(layout);
        (await ReadOwnAsync(await Login.OwnerAsync(clinic))).Layout.ShouldMatch(layout);
        var stored = JsonNode.Parse((await App.TemplateRowAsync(clinic.Id)).Layout)["calibration"];
        ((decimal)stored["xMm"]).ShouldBe(2m);
        ((decimal)stored["yMm"]).ShouldBe(-1.5m);
    }

    [Fact]
    [Trait("Case", "TPL-002")]
    public async Task A_layout_with_no_correction_is_answered_with_0_0_in_the_JSON()
    {
        var admin = await Login.SharedSuperAdminAsync();
        var clinic = await Data.Clinic();
        await admin.SaveTemplateAsync(clinic.Id, L());

        var calibration = (await (await admin.GetAsync(Route(clinic.Id))).ReadNodeAsync())["layout"]["calibration"];

        ((decimal)calibration["xMm"]).ShouldBe(0m);
        ((decimal)calibration["yMm"]).ShouldBe(0m);
    }

    [Fact]
    [Trait("Case", "TPL-608")]
    public async Task A_body_with_2_345_and_minus_0_04_is_stored_and_answered_as_2_3_and_0()
    {
        var admin = await Login.SharedSuperAdminAsync();
        var clinic = await Data.Clinic();

        var saved = await admin.SaveTemplateAsync(clinic.Id, L().WithCalibration(2.345m, -0.04m));

        saved.Layout.Calibration.ShouldBe(new PrescriptionCalibrationDto(2.3m, 0));
        (await admin.ReadTemplateAsync(clinic.Id)).Layout.Calibration.ShouldBe(new PrescriptionCalibrationDto(2.3m, 0));
        JsonNode.Parse((await App.TemplateRowAsync(clinic.Id)).Layout)["calibration"]["yMm"].ToJsonString().ShouldNotContain("-");
        (await (await admin.GetAsync(Route(clinic.Id))).ReadNodeAsync())["layout"]["calibration"]["yMm"].ToJsonString().ShouldNotContain("-");
    }

    [Fact]
    [Trait("Case", "TPL-607")]
    public async Task A_number_past_the_limit_is_refused_and_replaces_nothing()
    {
        var (admin, clinicId, nothingChanged) = await ClinicWithACorrectionAsync();

        var problem = await (await admin.PutTemplateAsync(clinicId, L().WithCalibration(20.05m, 0)))
            .ShouldBeProblemAsync(HttpStatusCode.BadRequest, "templateCalibrationInvalid");

        problem.Errors.Select(e => (e.Field, e.Code)).ShouldBe([("calibration.xMm", "templateCalibrationInvalid")]);
        await nothingChanged();
    }

    // ---- TPL-605: a row saved before this step ----

    public static TheoryData<string> RowsBeforeStep4 => new()
    {
        PaperImageApi.RowBeforeStep4,
        PaperImageApi.RowBeforeStep4[..^1] + ""","calibration":null}""",
    };

    [Theory]
    [MemberData(nameof(RowsBeforeStep4))]
    [Trait("Case", "TPL-605")]
    [Trait("Tier", "Smoke")]
    public async Task A_row_from_before_this_step_is_answered_with_0_0_by_either_route_and_needs_no_data_step(string raw)
    {
        var admin = await Login.SharedSuperAdminAsync();
        var clinic = await Data.Clinic();
        await admin.SaveTemplateAsync(clinic.Id, L());
        await App.SaveRawLayoutAsync(clinic.Id, raw);

        (await admin.ReadTemplateAsync(clinic.Id)).Layout.Calibration.ShouldBe(None);
        (await ReadOwnAsync(await Login.OwnerAsync(clinic))).Layout.Calibration.ShouldBe(None);

        var answered = (await (await admin.GetAsync(Route(clinic.Id))).ReadNodeAsync())["layout"];
        answered.AsObject().Select(p => p.Key).ShouldContain("calibration");
        ((decimal)answered["calibration"]["xMm"]).ShouldBe(0m);
        ((decimal)answered["calibration"]["yMm"]).ShouldBe(0m);
        (await App.TemplateRowAsync(clinic.Id)).Layout.ShouldBe(raw, "reading rewrites nothing");
    }

    // ---- TPL-606: an older tab's Save ----

    public static TheoryData<string> BodiesWithNoNumbers => new() { BodyWithNoCalibration, BodyWith("null") };

    [Theory]
    [MemberData(nameof(BodiesWithNoNumbers))]
    [Trait("Case", "TPL-606")]
    public async Task A_PUT_with_no_calibration_or_null_saves_0_0_and_resets_a_stored_one(string body)
    {
        var (admin, clinicId, _) = await ClinicWithACorrectionAsync();

        var response = await admin.PutRawTemplateAsync(clinicId, body);

        await response.ShouldBeOkAsync();
        (await response.ReadAsync<PrescriptionTemplateDto>()).Layout.Calibration.ShouldBe(None);
        (await admin.ReadTemplateAsync(clinicId)).Layout.Calibration.ShouldBe(None);
        var stored = JsonNode.Parse((await App.TemplateRowAsync(clinicId)).Layout)["calibration"];
        ((decimal)stored["xMm"]).ShouldBe(0m);
        ((decimal)stored["yMm"]).ShouldBe(0m);
    }

    // ---- TPL-609: numbers that are null or missing, wrong types, extras ----

    public static TheoryData<string, string[]> NullOrMissingNumbers => new()
    {
        { """{ "xMm": null, "yMm": 0 }""", ["calibration.xMm"] },
        { """{ "xMm": 0, "yMm": null }""", ["calibration.yMm"] },
        { """{ "yMm": 0 }""", ["calibration.xMm"] },
        { """{ "xMm": 0 }""", ["calibration.yMm"] },
        { "{}", ["calibration.xMm", "calibration.yMm"] },
        { """{ "xMm": null, "yMm": null }""", ["calibration.xMm", "calibration.yMm"] },
    };

    [Theory]
    [MemberData(nameof(NullOrMissingNumbers))]
    [Trait("Case", "TPL-609")]
    public async Task A_null_or_missing_number_is_invalidRequest_naming_it_and_replaces_nothing(string calibration, string[] fields)
    {
        var (admin, clinicId, nothingChanged) = await ClinicWithACorrectionAsync();

        var problem = await (await admin.PutRawTemplateAsync(clinicId, BodyWith(calibration))).ShouldBeProblemAsync(HttpStatusCode.BadRequest, "invalidRequest");

        problem.Errors.Select(e => (e.Field, e.Code)).ShouldBe(fields.Select(field => (field, "invalidRequest")));
        await nothingChanged();
    }

    public static TheoryData<string, string> WrongTypes => new()
    {
        { "calibration", "\"abc\"" },
        { "calibration", "5" },
        { "calibration", "[]" },
        { "calibration", "true" },
        { "calibration.xMm", """{ "xMm": "abc", "yMm": 0 }""" },
        { "calibration.yMm", """{ "xMm": 0, "yMm": "abc" }""" },
        { "calibration.xMm", """{ "xMm": [], "yMm": 0 }""" },
        { "calibration.yMm", """{ "xMm": 0, "yMm": {} }""" },
        { "calibration.xMm", """{ "xMm": true, "yMm": 0 }""" },
        { "calibration.xMm", """{ "xMm": 1e30, "yMm": 0 }""" },
        { "calibration.yMm", """{ "xMm": 0, "yMm": 1e30 }""" },
    };

    [Theory]
    [MemberData(nameof(WrongTypes))]
    [Trait("Case", "TPL-609")]
    public async Task A_wrong_type_is_invalidRequest_naming_it_and_replaces_nothing(string field, string calibration)
    {
        var (admin, clinicId, nothingChanged) = await ClinicWithACorrectionAsync();

        var problem = await (await admin.PutRawTemplateAsync(clinicId, BodyWith(calibration))).ShouldBeProblemAsync(HttpStatusCode.BadRequest, "invalidRequest");

        problem.ShouldHaveError(field, "invalidRequest");
        problem.Errors.ShouldAllBe(e => e.Code == "invalidRequest");
        problem.Errors.ShouldAllBe(e => e.Description == CommonErrors.InvalidRequest.Description);
        await nothingChanged();
    }

    [Fact]
    [Trait("Case", "TPL-609")]
    public async Task An_extra_property_is_dropped_from_the_answer_and_the_row()
    {
        var admin = await Login.SharedSuperAdminAsync();
        var clinic = await Data.Clinic();

        var response = await admin.PutRawTemplateAsync(clinic.Id, BodyWith("""{ "xMm": 2, "yMm": -1.5, "script": "x", "zMm": 9 }"""));

        await response.ShouldBeOkAsync();
        var answered = (await response.ReadNodeAsync())["layout"]["calibration"].AsObject();
        var stored = JsonNode.Parse((await App.TemplateRowAsync(clinic.Id)).Layout)["calibration"].AsObject();
        var read = (await (await admin.GetAsync(Route(clinic.Id))).ReadNodeAsync())["layout"]["calibration"].AsObject();
        foreach (var calibration in new[] { answered, stored, read })
        {
            calibration.Select(p => p.Key).ShouldBe(["xMm", "yMm"], ignoreOrder: true);
            ((decimal)calibration["xMm"]).ShouldBe(2m);
            ((decimal)calibration["yMm"]).ShouldBe(-1.5m);
            calibration["xMm"].GetValueKind().ShouldBe(JsonValueKind.Number);
        }
    }
}
