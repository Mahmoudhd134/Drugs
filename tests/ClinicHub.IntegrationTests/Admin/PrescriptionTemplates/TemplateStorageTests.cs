using System.Net;
using System.Text.Json.Nodes;
using ClinicHub.Application.Features.Prescriptions.Templates;
using ClinicHub.IntegrationTests.Harness.Assertions;
using ClinicHub.IntegrationTests.Harness.Hosting;
using Shouldly;
using static ClinicHub.IntegrationTests.Admin.PrescriptionTemplates.LayoutBuilder;

namespace ClinicHub.IntegrationTests.Admin.PrescriptionTemplates;

/// <summary>What the super admin reads, saves and deletes for a clinic, and what the table holds (contract § 1.2, § 1.5).</summary>
[Collection(AdminCollection7.Name)]
[Trait("Area", "admin")]
public class TemplateStorageTests(AppFixture app) : IntegrationTest(app)
{
    /// <summary>Every kind, not in id order, so "the same order" means something.</summary>
    private static PrescriptionLayoutDto EveryKind() => Layout(A5,
        Static("يُصرف مرة واحدة\nسطر ثان", "z9", fontSizePt: 10),
        Manual("الاسم", "m1"),
        Text("a1"),
        Function("time", "الوقت", "f2", xMm: 100, yMm: 10),
        FullDate("التاريخ", "f1"));

    [Fact]
    [Trait("Case", "TPL-001")]
    [Trait("Tier", "Smoke")]
    public async Task A_clinic_with_no_template_answers_204()
    {
        var admin = await Login.SharedSuperAdminAsync();
        var clinic = await Data.Clinic();

        await admin.ShouldHaveNoTemplateAsync(clinic.Id);
    }

    [Fact]
    [Trait("Case", "TPL-002")]
    [Trait("Tier", "Smoke")]
    public async Task A_saved_layout_is_answered_and_read_back_with_the_same_page_and_items_in_order()
    {
        var admin = await Login.SharedSuperAdminAsync();
        var clinic = await Data.Clinic();
        var layout = L();

        var saved = await admin.SaveTemplateAsync(clinic.Id, layout);

        saved.Layout.ShouldMatch(layout);
        saved.UpdatedAt.ShouldBe(Clock.GetUtcNow().UtcDateTime);
        var read = await admin.ReadTemplateAsync(clinic.Id);
        read.Layout.ShouldMatch(layout);
        read.UpdatedAt.ShouldBe(saved.UpdatedAt);
    }

    [Fact]
    [Trait("Case", "TPL-002")]
    public async Task Every_kind_keeps_its_fields_and_its_place_in_the_list()
    {
        var admin = await Login.SharedSuperAdminAsync();
        var clinic = await Data.Clinic();
        var layout = EveryKind();

        await admin.SaveTemplateAsync(clinic.Id, layout);

        var read = await admin.ReadTemplateAsync(clinic.Id);
        read.Layout.ShouldMatch(layout);
        read.Layout.Items.Select(i => i.Id).ShouldBe(["z9", "m1", "a1", "f2", "f1"]);
    }

    [Fact]
    [Trait("Case", "TPL-002")]
    public async Task The_answer_is_the_layout_and_updatedAt_and_nothing_else()
    {
        var admin = await Login.SharedSuperAdminAsync();
        var clinic = await Data.Clinic();
        await admin.SaveTemplateAsync(clinic.Id, Layout(A5, Text("t1")));

        var body = (await (await admin.GetAsync(Route(clinic.Id))).ReadNodeAsync()).AsObject();

        body.Select(p => p.Key).ShouldBe(["layout", "updatedAt"], ignoreOrder: true);
        var layout = body["layout"].AsObject();
        layout.Select(p => p.Key).ShouldBe(["schemaVersion", "page", "items"], ignoreOrder: true);
        layout["page"].AsObject().Select(p => p.Key).ShouldBe(["size", "widthMm", "heightMm"], ignoreOrder: true);
        var item = layout["items"].AsArray().ShouldHaveSingleItem().AsObject();
        item.Select(p => p.Key).ShouldBe(["id", "kind", "xMm", "yMm", "wMm", "hMm", "fontSizePt"], ignoreOrder: true);
        ((string)body["updatedAt"]).ShouldEndWith("Z");
    }

    [Fact]
    [Trait("Case", "TPL-003")]
    public async Task A_second_layout_replaces_the_first_and_the_clinic_still_has_one_row()
    {
        var admin = await Login.SharedSuperAdminAsync();
        var clinic = await Data.Clinic();
        await admin.SaveTemplateAsync(clinic.Id, L());
        var second = Layout(A4, Text("t2", xMm: 20, yMm: 100), Static("نص آخر", "s2"));

        var saved = await admin.SaveTemplateAsync(clinic.Id, second);

        saved.Layout.ShouldMatch(second);
        (await admin.ReadTemplateAsync(clinic.Id)).Layout.ShouldMatch(second);
        await App.TemplateRowAsync(clinic.Id);
    }

    [Fact]
    [Trait("Case", "TPL-004")]
    [Trait("Tier", "Smoke")]
    public async Task Deleting_a_template_answers_204_and_the_clinic_has_none()
    {
        var admin = await Login.SharedSuperAdminAsync();
        var clinic = await Data.Clinic();
        await admin.SaveTemplateAsync(clinic.Id, L());

        var body = await (await admin.DeleteAsync(Route(clinic.Id))).ShouldBeAsync(HttpStatusCode.NoContent);

        body.ShouldBeEmpty();
        await admin.ShouldHaveNoTemplateAsync(clinic.Id);
        (await App.TemplateRowsAsync(clinic.Id)).ShouldBeEmpty();
    }

    [Fact]
    [Trait("Case", "TPL-004")]
    public async Task A_deleted_template_can_be_saved_again()
    {
        var admin = await Login.SharedSuperAdminAsync();
        var clinic = await Data.Clinic();
        await admin.SaveTemplateAsync(clinic.Id, L());
        await (await admin.DeleteAsync(Route(clinic.Id))).ShouldBeAsync(HttpStatusCode.NoContent);
        var again = Layout(A4, Text());

        await admin.SaveTemplateAsync(clinic.Id, again);

        (await admin.ReadTemplateAsync(clinic.Id)).Layout.ShouldMatch(again);
        await App.TemplateRowAsync(clinic.Id);
    }

    [Fact]
    [Trait("Case", "TPL-005")]
    public async Task Deleting_when_there_is_none_answers_204_also_twice()
    {
        var admin = await Login.SharedSuperAdminAsync();
        var clinic = await Data.Clinic();

        await (await admin.DeleteAsync(Route(clinic.Id))).ShouldBeAsync(HttpStatusCode.NoContent);
        await (await admin.DeleteAsync(Route(clinic.Id))).ShouldBeAsync(HttpStatusCode.NoContent);

        await admin.ShouldHaveNoTemplateAsync(clinic.Id);
    }

    [Fact]
    [Trait("Case", "TPL-006")]
    [Trait("Tier", "Smoke")]
    public async Task Each_clinic_answers_its_own_layout_and_writing_one_leaves_the_other_unchanged()
    {
        var admin = await Login.SharedSuperAdminAsync();
        var (a, b) = (await Data.Clinic(), await Data.Clinic());
        var (layoutA, layoutB) = (L(), Layout(A4, Text("tb", xMm: 30), Manual("السن", "mb")));
        await admin.SaveTemplateAsync(a.Id, layoutA);
        var savedB = await admin.SaveTemplateAsync(b.Id, layoutB);

        (await admin.ReadTemplateAsync(a.Id)).Layout.ShouldMatch(layoutA);
        (await admin.ReadTemplateAsync(b.Id)).Layout.ShouldMatch(layoutB);

        Clock.Advance(TimeSpan.FromMinutes(1));
        await admin.SaveTemplateAsync(a.Id, Layout(A5, Text("new")));
        var stillB = await admin.ReadTemplateAsync(b.Id);
        stillB.Layout.ShouldMatch(layoutB);
        stillB.UpdatedAt.ShouldBe(savedB.UpdatedAt);

        await (await admin.DeleteAsync(Route(a.Id))).ShouldBeAsync(HttpStatusCode.NoContent);
        await admin.ShouldHaveNoTemplateAsync(a.Id);
        (await admin.ReadTemplateAsync(b.Id)).Layout.ShouldMatch(layoutB);
        (await App.TemplateRowAsync(b.Id)).ClinicId.ShouldBe(b.Id);
    }

    [Fact]
    [Trait("Case", "TPL-009")]
    public async Task A_suspended_clinics_template_is_saved()
    {
        var admin = await Login.SharedSuperAdminAsync();
        var clinic = await Data.Clinic().Suspended();
        var layout = L();

        var saved = await admin.SaveTemplateAsync(clinic.Id, layout);

        saved.Layout.ShouldMatch(layout);
        (await admin.ReadTemplateAsync(clinic.Id)).Layout.ShouldMatch(layout);
    }

    [Fact]
    [Trait("Case", "TPL-010")]
    public async Task A_new_clinic_starts_with_no_template_even_when_others_have_one()
    {
        var admin = await Login.SharedSuperAdminAsync();
        var existing = await Data.Clinic();
        await admin.SaveTemplateAsync(existing.Id, L());

        var created = await Data.Clinic();

        await admin.ShouldHaveNoTemplateAsync(created.Id);
        (await App.TemplateRowsAsync(created.Id)).ShouldBeEmpty();
        (await App.TemplateRowsAsync(await App.TemplateClinicIdAsync())).ShouldBeEmpty();
    }

    [Fact]
    [Trait("Case", "TPL-201")]
    public async Task Saving_again_keeps_the_row_and_CreatedAt_and_moves_UpdatedAt()
    {
        var admin = await Login.SharedSuperAdminAsync();
        var clinic = await Data.Clinic();
        var layout = L();
        var firstAnswer = await admin.SaveTemplateAsync(clinic.Id, layout);
        var first = await App.TemplateRowAsync(clinic.Id);

        Clock.Advance(TimeSpan.FromMinutes(1));
        var secondAnswer = await admin.SaveTemplateAsync(clinic.Id, layout);
        var second = await App.TemplateRowAsync(clinic.Id);

        second.Id.ShouldBe(first.Id);
        second.CreatedAt.ShouldBe(first.CreatedAt);
        second.UpdatedAt.ShouldBe(first.UpdatedAt.AddMinutes(1), "the same JSON still moves UpdatedAt");
        second.Layout.ShouldBe(first.Layout);
        secondAnswer.UpdatedAt.ShouldBe(firstAnswer.UpdatedAt.AddMinutes(1));
        (await admin.ReadTemplateAsync(clinic.Id)).UpdatedAt.ShouldBe(secondAnswer.UpdatedAt);
    }

    [Fact]
    [Trait("Case", "TPL-201")]
    public async Task Saving_another_layout_keeps_the_row_too()
    {
        var admin = await Login.SharedSuperAdminAsync();
        var clinic = await Data.Clinic();
        await admin.SaveTemplateAsync(clinic.Id, L());
        var first = await App.TemplateRowAsync(clinic.Id);

        Clock.Advance(TimeSpan.FromMinutes(2));
        await admin.SaveTemplateAsync(clinic.Id, Layout(A4, Text()));
        var second = await App.TemplateRowAsync(clinic.Id);

        second.Id.ShouldBe(first.Id);
        second.CreatedAt.ShouldBe(first.CreatedAt);
        second.UpdatedAt.ShouldBe(first.UpdatedAt.AddMinutes(2));
        second.Layout.ShouldNotBe(first.Layout);
    }

    [Fact]
    [Trait("Case", "TPL-206")]
    public async Task Suspending_and_activating_a_clinic_leaves_its_template_unchanged()
    {
        var admin = await Login.SharedSuperAdminAsync();
        var clinic = await Data.Clinic();
        var layout = L();
        await admin.SaveTemplateAsync(clinic.Id, layout);
        var before = await App.TemplateRowAsync(clinic.Id);

        Clock.Advance(TimeSpan.FromMinutes(1));
        await Data.SuspendClinicAsync(clinic);

        var whileSuspended = await admin.ReadTemplateAsync(clinic.Id);
        whileSuspended.Layout.ShouldMatch(layout);
        whileSuspended.UpdatedAt.ShouldBe(before.UpdatedAt);

        Clock.Advance(TimeSpan.FromMinutes(1));
        await Data.ActivateClinicAsync(clinic);

        (await admin.ReadTemplateAsync(clinic.Id)).Layout.ShouldMatch(layout);
        var after = await App.TemplateRowAsync(clinic.Id);
        after.Layout.ShouldBe(before.Layout);
        after.UpdatedAt.ShouldBe(before.UpdatedAt);
    }

    [Fact]
    [Trait("Case", "TPL-206")]
    public async Task While_suspended_DELETE_answers_204_and_removes_it()
    {
        var admin = await Login.SharedSuperAdminAsync();
        var clinic = await Data.Clinic();
        await admin.SaveTemplateAsync(clinic.Id, L());
        await Data.SuspendClinicAsync(clinic);

        await (await admin.DeleteAsync(Route(clinic.Id))).ShouldBeAsync(HttpStatusCode.NoContent);

        await admin.ShouldHaveNoTemplateAsync(clinic.Id);
    }

    // ---- What is stored: rounded, trimmed, as typed, only the DTO's fields ----

    [Fact]
    [Trait("Case", "TPL-209")]
    public async Task A_body_with_12_34_is_stored_and_answered_as_12_3()
    {
        var admin = await Login.SharedSuperAdminAsync();
        var clinic = await Data.Clinic();

        var saved = await admin.SaveTemplateAsync(clinic.Id, Layout(Custom(200.04m, 300.05m), Text(xMm: 12.34m, yMm: 12.35m, wMm: 100.14m, hMm: 50.15m, fontSizePt: 11.04m)));

        var expected = Layout(Custom(200m, 300.1m), Text(xMm: 12.3m, yMm: 12.4m, wMm: 100.1m, hMm: 50.2m, fontSizePt: 11m));
        saved.Layout.ShouldMatch(expected);
        (await admin.ReadTemplateAsync(clinic.Id)).Layout.ShouldMatch(expected);
        PrescriptionLayoutRules.Deserialize((await App.TemplateRowAsync(clinic.Id)).Layout).ShouldMatch(expected);
    }

    [Fact]
    [Trait("Case", "TPL-213")]
    public async Task A_name_of_60_with_spaces_around_it_is_answered_trimmed()
    {
        var admin = await Login.SharedSuperAdminAsync();
        var clinic = await Data.Clinic();
        var name = new string('ن', 60);

        var saved = await admin.SaveTemplateAsync(clinic.Id, Layout(A5, Text(), Manual($"  {name} ")));

        saved.Layout.Items[1].Name.ShouldBe(name);
        (await admin.ReadTemplateAsync(clinic.Id)).Layout.Items[1].Name.ShouldBe(name);
    }

    [Fact]
    [Trait("Case", "TPL-030")]
    [Trait("Case", "TPL-212")]
    public async Task A_static_text_is_kept_as_typed_with_its_line_breaks_and_tabs()
    {
        var admin = await Login.SharedSuperAdminAsync();
        var clinic = await Data.Clinic();
        const string typed = "  سطر أول\r\nسطر\tثان\nثالث ";

        var saved = await admin.SaveTemplateAsync(clinic.Id, Layout(A5, Text(), Static(typed)));

        saved.Layout.Items[1].Text.ShouldBe(typed);
        (await admin.ReadTemplateAsync(clinic.Id)).Layout.Items[1].Text.ShouldBe(typed);
    }

    [Fact]
    [Trait("Case", "TPL-208")]
    public async Task Two_items_with_the_same_box_are_saved_and_both_stay()
    {
        var admin = await Login.SharedSuperAdminAsync();
        var clinic = await Data.Clinic();
        var layout = Layout(A5, Text(), Manual("الاسم", "m1", 10, 10, 20, 8), Manual("السن", "m2", 10, 10, 20, 8));

        await admin.SaveTemplateAsync(clinic.Id, layout);

        (await admin.ReadTemplateAsync(clinic.Id)).Layout.ShouldMatch(layout);
    }

    [Fact]
    [Trait("Case", "TPL-203")]
    public async Task An_unknown_property_and_another_kinds_fields_are_neither_answered_nor_stored()
    {
        var admin = await Login.SharedSuperAdminAsync();
        var clinic = await Data.Clinic();
        const string body = """
            {
              "schemaVersion": 1, "script": "top",
              "page": { "size": "A5", "widthMm": 148, "heightMm": 210, "script": "page" },
              "items": [
                { "id": "t1", "kind": "prescriptionText", "xMm": 14, "yMm": 80, "wMm": 120, "hMm": 90, "fontSizePt": 11,
                  "script": "x", "text": "another kind's", "name": "another kind's", "function": "time" },
                { "id": "s1", "kind": "staticText", "text": "نص", "xMm": 14, "yMm": 175, "wMm": 60, "hMm": 8, "fontSizePt": 11,
                  "script": "x", "name": "another kind's", "function": "time" },
                { "id": "m1", "kind": "manualInput", "name": "الاسم", "xMm": 58, "yMm": 46, "wMm": 72, "hMm": 8, "fontSizePt": 11,
                  "script": "x", "text": "another kind's", "function": "time" },
                { "id": "f1", "kind": "function", "function": "time", "name": "الوقت", "xMm": 14, "yMm": 46, "wMm": 30, "hMm": 8, "fontSizePt": 11,
                  "script": "x", "text": "another kind's" }
              ]
            }
            """;
        string[] box = ["xMm", "yMm", "wMm", "hMm", "fontSizePt"];

        var put = await admin.PutRawTemplateAsync(clinic.Id, body);
        await put.ShouldBeOkAsync();

        var stored = JsonNode.Parse((await App.TemplateRowAsync(clinic.Id)).Layout).AsObject();
        var read = (await (await admin.GetAsync(Route(clinic.Id))).ReadNodeAsync())["layout"].AsObject();
        var answered = (await put.ReadNodeAsync())["layout"].AsObject();
        foreach (var layout in new[] { stored, read, answered })
        {
            layout.Select(p => p.Key).ShouldBe(["schemaVersion", "page", "items"], ignoreOrder: true);
            layout["page"].AsObject().Select(p => p.Key).ShouldBe(["size", "widthMm", "heightMm"], ignoreOrder: true);
            var items = layout["items"].AsArray();
            items[0].AsObject().Select(p => p.Key).ShouldBe(["id", "kind", .. box], ignoreOrder: true);
            items[1].AsObject().Select(p => p.Key).ShouldBe(["id", "kind", "text", .. box], ignoreOrder: true);
            items[2].AsObject().Select(p => p.Key).ShouldBe(["id", "kind", "name", .. box], ignoreOrder: true);
            items[3].AsObject().Select(p => p.Key).ShouldBe(["id", "kind", "function", "name", .. box], ignoreOrder: true);
        }
    }

    [Fact]
    [Trait("Case", "TPL-204")]
    public async Task A_number_as_a_string_that_parses_is_a_number_from_then_on()
    {
        var admin = await Login.SharedSuperAdminAsync();
        var clinic = await Data.Clinic();

        var response = await admin.PutRawTemplateAsync(clinic.Id, """
            { "schemaVersion": 1, "page": { "size": "A5", "widthMm": 148, "heightMm": 210 },
              "items": [ { "id": "t1", "kind": "prescriptionText", "xMm": "12", "yMm": "80.34", "wMm": 120, "hMm": 90, "fontSizePt": 11 } ] }
            """);

        await response.ShouldBeOkAsync();
        var item = (await admin.ReadTemplateAsync(clinic.Id)).Layout.Items.ShouldHaveSingleItem();
        item.XMm.ShouldBe(12m);
        item.YMm.ShouldBe(80.3m);
        JsonNode.Parse((await App.TemplateRowAsync(clinic.Id)).Layout)["items"][0]["xMm"].GetValueKind().ShouldBe(System.Text.Json.JsonValueKind.Number);
    }
}
