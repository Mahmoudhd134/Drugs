using System.Net;
using ClinicHub.Application.Common.Results;
using ClinicHub.Application.Features.Prescriptions.Templates;
using ClinicHub.IntegrationTests.Harness.Assertions;
using ClinicHub.IntegrationTests.Harness.Hosting;
using Shouldly;
using static ClinicHub.IntegrationTests.Admin.PrescriptionTemplates.LayoutBuilder;

namespace ClinicHub.IntegrationTests.Admin.PrescriptionTemplates;

/// <summary>Refusals through HTTP: the answer's shape and that nothing is stored or replaced (TPL-020, TPL-021, TPL-202).</summary>
[Collection(AdminCollection7.Name)]
[Trait("Area", "admin")]
public class TemplateValidationTests(AppFixture app) : IntegrationTest(app)
{
    [Fact]
    [Trait("Case", "TPL-020")]
    [Trait("Tier", "Smoke")]
    public async Task No_prescription_text_is_400_templateTextCount_and_nothing_is_stored()
    {
        var admin = await Login.SharedSuperAdminAsync();
        var clinic = await Data.Clinic();

        var response = await admin.PutTemplateAsync(clinic.Id, Layout(A5, Manual("الاسم")));

        var problem = await response.ShouldBeProblemAsync(HttpStatusCode.BadRequest, "templateTextCount");
        problem.Errors.Select(e => (e.Field, e.Code)).ShouldBe([("items", "templateTextCount")]);
        await admin.ShouldHaveNoTemplateAsync(clinic.Id);
        (await App.TemplateRowsAsync(clinic.Id)).ShouldBeEmpty();
    }

    [Fact]
    [Trait("Case", "TPL-020")]
    public async Task Two_prescription_texts_are_400_templateTextCount_and_nothing_is_stored()
    {
        var admin = await Login.SharedSuperAdminAsync();
        var clinic = await Data.Clinic();

        var response = await admin.PutTemplateAsync(clinic.Id, Layout(A5, Text("t1"), Text("t2")));

        var problem = await response.ShouldBeProblemAsync(HttpStatusCode.BadRequest, "templateTextCount");
        problem.Errors.Select(e => (e.Field, e.Code)).ShouldBe([("items", "templateTextCount")]);
        (await App.TemplateRowsAsync(clinic.Id)).ShouldBeEmpty();
    }

    public static TheoryData<string> InvalidLayoutNames => new(new[] { "kind", "function", "schemaVersion", "duplicate id" });

    private static (PrescriptionLayoutDto Layout, string Field) InvalidLayout(string name) => name switch
    {
        "kind" => (L().With(Manual("السن", "x1") with { Kind = "qrCode" }), "items[3].kind"),
        "function" => (L().With(Function("unixTime", "الساعة", "f9")), "items[3].function"),
        "schemaVersion" => (L() with { SchemaVersion = 2 }, "schemaVersion"),
        "duplicate id" => (L().With(Manual("السن", "m1")), "items[3].id"),
        _ => throw new ArgumentOutOfRangeException(nameof(name)),
    };

    [Theory]
    [MemberData(nameof(InvalidLayoutNames))]
    [Trait("Case", "TPL-021")]
    public async Task An_unknown_kind_function_or_schema_version_or_a_duplicate_id_is_400_templateLayoutInvalid_naming_it(string name)
    {
        var admin = await Login.SharedSuperAdminAsync();
        var clinic = await Data.Clinic();
        var (layout, field) = InvalidLayout(name);

        var problem = await (await admin.PutTemplateAsync(clinic.Id, layout)).ShouldBeProblemAsync(HttpStatusCode.BadRequest, "templateLayoutInvalid");

        problem.Errors.Select(e => (e.Field, e.Code)).ShouldBe([(field, "templateLayoutInvalid")]);
        (await App.TemplateRowsAsync(clinic.Id)).ShouldBeEmpty();
    }

    [Fact]
    [Trait("Case", "TPL-021")]
    public async Task Every_failure_is_listed_in_order_with_its_description_and_code_is_the_first()
    {
        var admin = await Login.SharedSuperAdminAsync();
        var clinic = await Data.Clinic();
        var layout = Layout(A5, Text(), Manual(""), Function("fullDate", "الوقت", xMm: 500));

        var problem = await (await admin.PutTemplateAsync(clinic.Id, layout)).ShouldBeProblemAsync(HttpStatusCode.BadRequest, "nameRequired");

        problem.Status.ShouldBe(400);
        problem.Detail.ShouldBe(CommonErrors.NameRequired.Description);
        problem.Errors.Select(e => (e.Code, e.Description, e.Field)).ShouldBe(
        [
            ("nameRequired", CommonErrors.NameRequired.Description, "items[1].name"),
            ("templateItemOutsidePage", PrescriptionTemplateErrors.ItemOutsidePage.Description, "items[2].xMm"),
        ]);
    }

    public static TheoryData<string> RefusedCodes => new(new[]
    {
        "templateLayoutInvalid", "templateTextCount", "templatePageInvalid", "templateItemOutsidePage", "templateItemSizeInvalid",
        "templateFontSizeInvalid", "templateItemNameTaken", "templateStaticTextRequired", "templateStaticTextTooLong", "templateTooManyItems",
    });

    /// <summary>A layout refused with exactly this code, on this field.</summary>
    private static (PrescriptionLayoutDto Layout, string Field) RefusedWith(string code) => code switch
    {
        "templateLayoutInvalid" => (L() with { SchemaVersion = 9 }, "schemaVersion"),
        "templateTextCount" => (Layout(A5, Manual("الاسم")), "items"),
        "templatePageInvalid" => (Layout(new("A5", 150, 210), Text()), "page.widthMm"),
        "templateItemOutsidePage" => (Layout(A5, Text(xMm: 28.1m)), "items[0].xMm"),
        "templateItemSizeInvalid" => (Layout(A5, Text(wMm: 4.9m)), "items[0].wMm"),
        "templateFontSizeInvalid" => (Layout(A5, Text(fontSizePt: 36.1m)), "items[0].fontSizePt"),
        "templateItemNameTaken" => (Layout(A5, Text(), Manual("الاسم", "m1"), Manual("الاسم", "m2")), "items[2].name"),
        "templateStaticTextRequired" => (Layout(A5, Text(), Static("")), "items[1].text"),
        "templateStaticTextTooLong" => (Layout(A5, Text(), Static(new string('ن', 1001))), "items[1].text"),
        "templateTooManyItems" => (Layout(A5, [Text(), .. ManyManual(50)]), "items"),
        _ => throw new ArgumentOutOfRangeException(nameof(code)),
    };

    [Theory]
    [MemberData(nameof(RefusedCodes))]
    [Trait("Case", "TPL-202")]
    public async Task An_invalid_layout_answers_400_and_the_earlier_layout_stays_unchanged(string code)
    {
        var admin = await Login.SharedSuperAdminAsync();
        var clinic = await Data.Clinic();
        var earlier = L();
        var saved = await admin.SaveTemplateAsync(clinic.Id, earlier);
        var row = await App.TemplateRowAsync(clinic.Id);
        var (refused, field) = RefusedWith(code);
        Clock.Advance(TimeSpan.FromMinutes(1));

        var problem = await (await admin.PutTemplateAsync(clinic.Id, refused)).ShouldBeProblemAsync(HttpStatusCode.BadRequest, code);

        problem.Errors.Select(e => (e.Field, e.Code)).ShouldBe([(field, code)]);
        var read = await admin.ReadTemplateAsync(clinic.Id);
        read.Layout.ShouldMatch(earlier);
        read.UpdatedAt.ShouldBe(saved.UpdatedAt);
        var after = await App.TemplateRowAsync(clinic.Id);
        after.Id.ShouldBe(row.Id);
        after.Layout.ShouldBe(row.Layout);
        after.UpdatedAt.ShouldBe(row.UpdatedAt);
    }
}
