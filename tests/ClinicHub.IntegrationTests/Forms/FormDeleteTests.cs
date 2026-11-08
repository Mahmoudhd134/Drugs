using System.Net;
using ClinicHub.Domain.Forms;
using ClinicHub.IntegrationTests.Harness.Assertions;
using ClinicHub.IntegrationTests.Harness.Hosting;
using Shouldly;

namespace ClinicHub.IntegrationTests.Forms;

/// <summary><c>DELETE /admin/forms/{id}</c> (contract A5, A6, § 4).</summary>
[Collection(FormsCollection.Name)]
[Trait("Area", "forms")]
public class FormDeleteTests(AppFixture app) : FormApiTest(app)
{
    /// <summary>A second version, made active: nothing but SQL gives one to a form on the plain app, where <c>IFormUsage</c> says false.</summary>
    private async Task AddActiveVersion2Async(int formId, string definition)
    {
        await App.OutsideTheApp.ExecuteAsync(
            """INSERT INTO "FormVersions" ("FormId", "VersionNumber", "Definition", "CreatedAt", "UpdatedAt") VALUES (@p0, 2, @p1, now(), now())""",
            formId, definition);
        await App.OutsideTheApp.ExecuteAsync("""UPDATE "Forms" SET "ActiveVersionNumber" = 2 WHERE "Id" = @p0""", formId);
    }

    private static string VersionsOf(IEnumerable<FormVersion> versions) =>
        string.Join("\n", versions.Select(v => $"{v.VersionNumber}|{v.Definition}|{v.CreatedAt:O}|{v.UpdatedAt:O}"));

    [Fact]
    [Trait("Case", "FRM-090")]
    public async Task A_deleted_form_answers_204_and_then_404_on_get()
    {
        var admin = await AdminAsync();
        var form = await Data.Form();

        await (await admin.DeleteAsync(FormsApi.Item(form.Id))).ShouldBeAsync(HttpStatusCode.NoContent);

        await (await admin.GetAsync(FormsApi.Item(form.Id))).ShouldBeProblemAsync(HttpStatusCode.NotFound, "notFound");
    }

    [Fact]
    [Trait("Case", "FRM-091")]
    public async Task Deleting_marks_the_row_with_the_clocks_time_and_leaves_the_versions_unchanged()
    {
        var admin = await AdminAsync();
        var form = await Data.Form();
        var before = await App.VersionRowsAsync(form.Id);
        before.ShouldHaveSingleItem();

        Clock.Advance(TimeSpan.FromMinutes(5));
        await (await admin.DeleteAsync(FormsApi.Item(form.Id))).ShouldBeAsync(HttpStatusCode.NoContent);

        var row = await App.FormRowAsync(form.Id);
        row.ShouldNotBeNull();
        row.IsDeleted.ShouldBeTrue();
        row.DeletedAt.ShouldBe(Now);
        VersionsOf(await App.VersionRowsAsync(form.Id)).ShouldBe(VersionsOf(before));
    }

    [Fact]
    [Trait("Case", "FRM-092")]
    public async Task Deleting_a_deleted_form_answers_notFound_and_DeletedAt_does_not_move()
    {
        var admin = await AdminAsync();
        var form = await Data.Form().Deleted();
        var deletedAt = (await App.FormRowAsync(form.Id)).DeletedAt;
        deletedAt.ShouldNotBeNull();

        Clock.Advance(TimeSpan.FromMinutes(5));
        await (await admin.DeleteAsync(FormsApi.Item(form.Id))).ShouldBeProblemAsync(HttpStatusCode.NotFound, "notFound");

        (await App.FormRowAsync(form.Id)).DeletedAt.ShouldBe(deletedAt);
    }

    [Fact]
    [Trait("Case", "FRM-092")]
    public async Task Deleting_an_id_with_no_form_answers_notFound()
    {
        var admin = await AdminAsync();

        await (await admin.DeleteAsync(FormsApi.Item(int.MaxValue))).ShouldBeProblemAsync(HttpStatusCode.NotFound, "notFound");
    }

    [Fact]
    [Trait("Case", "FRM-093")]
    public async Task Deleting_a_form_on_two_versions_leaves_both_rows()
    {
        var admin = await AdminAsync();
        var form = await Data.Form();
        await AddActiveVersion2Async(form.Id, """{"version":2}""");
        var before = await App.VersionRowsAsync(form.Id);
        before.Select(version => version.VersionNumber).ShouldBe([1, 2]);

        Clock.Advance(TimeSpan.FromMinutes(5));
        await (await admin.DeleteAsync(FormsApi.Item(form.Id))).ShouldBeAsync(HttpStatusCode.NoContent);

        VersionsOf(await App.VersionRowsAsync(form.Id)).ShouldBe(VersionsOf(before));
    }

    [Theory]
    [Trait("Case", "FRM-169")]
    [InlineData("""{"schemaVersion":99}""")]
    [InlineData("{}")]
    public async Task A_form_the_builder_could_not_read_can_be_deleted(string definition)
    {
        var admin = await AdminAsync();
        var form = await Data.Form().WithDefinition(definition);

        await (await admin.DeleteAsync(FormsApi.Item(form.Id))).ShouldBeAsync(HttpStatusCode.NoContent);

        (await App.FormRowAsync(form.Id)).IsDeleted.ShouldBeTrue();
    }
}
