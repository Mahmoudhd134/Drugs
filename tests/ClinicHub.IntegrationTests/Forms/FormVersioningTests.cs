using ClinicHub.Application.Features.Forms.Definitions;
using ClinicHub.IntegrationTests.Harness.Builders;
using ClinicHub.IntegrationTests.Harness.Clients;
using Shouldly;

namespace ClinicHub.IntegrationTests.Forms;

/// <summary>
/// Saving against <c>IFormUsage</c> (contract § 3, design D6): a used form's change makes a new version, an unused one's replaces the active version.
/// The usage is the fixture's switch, since nothing real uses a form yet.
/// </summary>
[Collection(FormsSavingCollection.Name)]
[Trait("Area", "forms")]
public class FormVersioningTests(FormsAppFixture app) : FormSavingTest(app)
{
    private const string First = """{"schemaVersion":1,"nodes":[{"id":"first"}]}""";
    private const string Second = """{"schemaVersion":1,"nodes":[{"id":"second"}]}""";
    private const string Third = """{"schemaVersion":1,"nodes":[{"id":"third"}]}""";

    private DateTime Now => Clock.GetUtcNow().UtcDateTime;

    [Fact]
    [Trait("Case", "FRM-075")]
    public async Task A_change_on_a_used_form_makes_version_2_active_and_version_1_stays()
    {
        var admin = await Login.SharedSuperAdminAsync();
        var form = await Data.Form().WithDefinition(First);
        Usage.MarkUsed(form.Id);
        var first = (await App.VersionsAsync(form.Id)).ShouldHaveSingleItem();

        Clock.Advance(FormSaveKit.Later);
        var saved = await admin.SaveAsync(form.Id, form.Name, Second);

        saved.ActiveVersionNumber.ShouldBe(2);
        saved.ShouldHoldDefinition(Second);
        var read = await admin.DetailsAsync(form.Id);
        read.ActiveVersionNumber.ShouldBe(2);
        read.ShouldHoldDefinition(Second);
        (await App.FormStateAsync(form.Id)).ActiveVersionNumber.ShouldBe(2);

        var rows = await App.VersionsAsync(form.Id);
        rows.Select(v => v.Number).ShouldBe([1, 2]);
        rows[0].ShouldBe(first, "the old version stays as it was");
        rows[1].Definition.ShouldBe(Second);
    }

    [Fact]
    [Trait("Case", "FRM-076")]
    public async Task The_same_definition_and_another_name_on_a_used_form_make_no_version()
    {
        var admin = await Login.SharedSuperAdminAsync();
        var form = await Data.Form().WithDefinition(First);
        Usage.MarkUsed(form.Id);
        var before = await App.VersionsAsync(form.Id);
        var name = Unique.Name("Renamed", "معدل");

        Clock.Advance(FormSaveKit.Later);
        var saved = await admin.SaveAsync(form.Id, name, First);

        saved.Name.ShouldBe(name);
        saved.ActiveVersionNumber.ShouldBe(1);
        (await App.FormStateAsync(form.Id)).Name.ShouldBe(name);
        (await App.VersionsAsync(form.Id)).ShouldBe(before);
    }

    [Fact]
    [Trait("Case", "FRM-077")]
    public async Task A_change_on_version_2_no_longer_used_replaces_version_2_and_leaves_version_1()
    {
        var (admin, form) = await FormOnVersion2Async();
        var first = (await App.VersionsAsync(form.Id))[0];
        Usage.MarkNotUsed(form.Id);

        Clock.Advance(FormSaveKit.Later);
        var saved = await admin.SaveAsync(form.Id, form.Name, Third);

        saved.ActiveVersionNumber.ShouldBe(2);
        (await App.FormStateAsync(form.Id)).ActiveVersionNumber.ShouldBe(2);
        var rows = await App.VersionsAsync(form.Id);
        rows.Select(v => v.Number).ShouldBe([1, 2]);
        rows[0].ShouldBe(first);
        rows[1].Definition.ShouldBe(Third);
    }

    [Fact]
    [Trait("Case", "FRM-078")]
    public async Task A_change_on_version_2_still_used_makes_version_3_active()
    {
        var (admin, form) = await FormOnVersion2Async();
        var before = await App.VersionsAsync(form.Id);

        Clock.Advance(FormSaveKit.Later);
        var saved = await admin.SaveAsync(form.Id, form.Name, Third);

        saved.ActiveVersionNumber.ShouldBe(3);
        (await App.FormStateAsync(form.Id)).ActiveVersionNumber.ShouldBe(3);
        var rows = await App.VersionsAsync(form.Id);
        rows.Select(v => v.Number).ShouldBe([1, 2, 3]);
        rows.Take(2).ShouldBe(before);
        rows[2].Definition.ShouldBe(Third);
    }

    [Fact]
    [Trait("Case", "FRM-160")]
    public async Task Version_1s_text_on_a_used_form_on_version_2_makes_version_3()
    {
        var (admin, form) = await FormOnVersion2Async();
        var before = await App.VersionsAsync(form.Id);

        Clock.Advance(FormSaveKit.Later);
        var saved = await admin.SaveAsync(form.Id, form.Name, First);

        saved.ActiveVersionNumber.ShouldBe(3);
        saved.ShouldHoldDefinition(First);
        var rows = await App.VersionsAsync(form.Id);
        rows.Select(v => v.Number).ShouldBe([1, 2, 3]);
        rows.Take(2).ShouldBe(before);
        rows[2].Definition.ShouldBe(First);
    }

    [Fact]
    [Trait("Case", "FRM-161")]
    public async Task With_version_1_set_active_by_hand_reading_and_saving_work_on_version_1()
    {
        var (admin, form) = await FormOnVersion2Async();
        var second = (await App.VersionsAsync(form.Id))[1];
        await App.OutsideTheApp.ExecuteAsync("""UPDATE "Forms" SET "ActiveVersionNumber" = 1 WHERE "Id" = @p0""", form.Id);
        Usage.MarkNotUsed(form.Id);

        var read = await admin.DetailsAsync(form.Id);
        read.ActiveVersionNumber.ShouldBe(1);
        read.ShouldHoldDefinition(First);

        Clock.Advance(FormSaveKit.Later);
        var saved = await admin.SaveAsync(form.Id, form.Name, Third);

        saved.ActiveVersionNumber.ShouldBe(1);
        (await App.FormStateAsync(form.Id)).ActiveVersionNumber.ShouldBe(1);
        var rows = await App.VersionsAsync(form.Id);
        rows.Select(v => v.Number).ShouldBe([1, 2]);
        rows[0].Definition.ShouldBe(Third);
        rows[1].ShouldBe(second);
    }

    [Fact]
    [Trait("Case", "FRM-162")]
    public async Task With_versions_1_2_and_5_and_2_active_a_change_on_a_used_form_makes_version_6()
    {
        var (admin, form) = await FormOnVersion2Async();
        await App.OutsideTheApp.ExecuteAsync(
            """INSERT INTO "FormVersions" ("FormId", "VersionNumber", "Definition", "CreatedAt", "UpdatedAt") VALUES (@p0, 5, @p1, now(), now())""", form.Id, Third);
        var before = await App.VersionsAsync(form.Id);
        (await App.FormStateAsync(form.Id)).ActiveVersionNumber.ShouldBe(2);

        Clock.Advance(FormSaveKit.Later);
        var saved = await admin.SaveAsync(form.Id, form.Name, """{"changed":true}""");

        saved.ActiveVersionNumber.ShouldBe(6);
        (await App.FormStateAsync(form.Id)).ActiveVersionNumber.ShouldBe(6);
        var rows = await App.VersionsAsync(form.Id);
        rows.Select(v => v.Number).ShouldBe([1, 2, 5, 6]);
        rows.Take(3).ShouldBe(before);
    }

    [Fact]
    [Trait("Case", "FRM-163")]
    public async Task A_replaced_version_has_a_new_UpdatedAt_and_keeps_its_CreatedAt_and_the_forms()
    {
        var admin = await Login.SharedSuperAdminAsync();
        var form = await Data.Form().WithDefinition(First);
        var created = (await App.FormStateAsync(form.Id)).CreatedAt;
        var version = (await App.VersionsAsync(form.Id)).ShouldHaveSingleItem();

        Clock.Advance(FormSaveKit.Later);
        await admin.SaveAsync(form.Id, form.Name, Second);

        var replaced = (await App.VersionsAsync(form.Id)).ShouldHaveSingleItem();
        replaced.UpdatedAt.ShouldNotBe(version.UpdatedAt);
        replaced.UpdatedAt.ShouldBe(Now);
        replaced.CreatedAt.ShouldBe(version.CreatedAt);
        (await App.FormStateAsync(form.Id)).CreatedAt.ShouldBe(created);
    }

    [Fact]
    [Trait("Case", "FRM-163")]
    public async Task A_new_version_has_both_stamps_at_the_clock_and_the_form_keeps_its_CreatedAt()
    {
        var admin = await Login.SharedSuperAdminAsync();
        var form = await Data.Form().WithDefinition(First);
        Usage.MarkUsed(form.Id);
        var created = (await App.FormStateAsync(form.Id)).CreatedAt;

        Clock.Advance(FormSaveKit.Later);
        await admin.SaveAsync(form.Id, form.Name, Second);

        var added = (await App.VersionsAsync(form.Id)).Single(v => v.Number == 2);
        added.CreatedAt.ShouldBe(Now);
        added.UpdatedAt.ShouldBe(Now);
        (await App.FormStateAsync(form.Id)).CreatedAt.ShouldBe(created);
    }

    [Fact]
    [Trait("Case", "FRM-164")]
    public async Task Usage_is_per_form_so_the_used_one_gets_a_version_2_and_the_other_is_replaced()
    {
        var admin = await Login.SharedSuperAdminAsync();
        var used = await Data.Form().WithDefinition(First);
        var notUsed = await Data.Form().WithDefinition(First);
        Usage.MarkUsed(used.Id);

        var savedUsed = await admin.SaveAsync(used.Id, used.Name, Second);
        var savedNotUsed = await admin.SaveAsync(notUsed.Id, notUsed.Name, Second);

        savedUsed.ActiveVersionNumber.ShouldBe(2);
        (await App.VersionsAsync(used.Id)).Select(v => v.Definition).ShouldBe([First, Second]);
        savedNotUsed.ActiveVersionNumber.ShouldBe(1);
        (await App.VersionsAsync(notUsed.Id)).ShouldHaveSingleItem().Definition.ShouldBe(Second);
    }

    /// <summary>A used form with <see cref="First"/> as version 1 and <see cref="Second"/> as version 2, active.</summary>
    private async Task<(ApiClient Admin, FormDetails Form)> FormOnVersion2Async()
    {
        var admin = await Login.SharedSuperAdminAsync();
        var form = await Data.Form().WithDefinition(First);
        Usage.MarkUsed(form.Id);
        var saved = await admin.SaveAsync(form.Id, form.Name, Second);
        saved.ActiveVersionNumber.ShouldBe(2, "the test's own setup");
        return (admin, saved);
    }
}
