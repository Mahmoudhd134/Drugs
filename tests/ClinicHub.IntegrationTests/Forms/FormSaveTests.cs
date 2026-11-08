using System.Net;
using System.Text;
using System.Text.Json;
using ClinicHub.Application.Common.Paging;
using ClinicHub.Application.Features.Forms.Definitions;
using ClinicHub.IntegrationTests.Harness.Assertions;
using ClinicHub.IntegrationTests.Harness.Builders;
using ClinicHub.IntegrationTests.Harness.Clients;
using ClinicHub.IntegrationTests.Harness.Hosting;
using Microsoft.EntityFrameworkCore;
using Shouldly;

namespace ClinicHub.IntegrationTests.Forms;

/// <summary>
/// Saving a form that isn't used (contract § 3): what counts as unchanged, what gets written, and <c>updatedAt</c>. Spelling and "no row written" read
/// the rows, stored text and <c>UpdatedAt</c> both, since the answer re-serializes. The clock moves before a save, so a moved stamp shows.
/// </summary>
[Collection(FormsSavingCollection.Name)]
[Trait("Area", "forms")]
public class FormSaveTests(FormsAppFixture app) : FormSavingTest(app)
{
    private const string First = """{"schemaVersion":1,"nodes":[{"id":"first"}]}""";
    private const string Second = """{"schemaVersion":1,"nodes":[{"id":"second"}]}""";

    private DateTime Now => Clock.GetUtcNow().UtcDateTime;

    [Fact]
    [Trait("Case", "FRM-070")]
    public async Task Another_definition_and_name_on_a_form_not_used_change_both_and_stay_on_version_1()
    {
        var admin = await Login.SharedSuperAdminAsync();
        var form = await Data.Form().WithDefinition(First);
        var name = Unique.Name("Saved", "محفوظ");

        var saved = await admin.SaveAsync(form.Id, name, Second);

        saved.Id.ShouldBe(form.Id);
        saved.Name.ShouldBe(name);
        saved.ActiveVersionNumber.ShouldBe(1);
        saved.ShouldHoldDefinition(Second);

        var read = await admin.DetailsAsync(form.Id);
        read.Id.ShouldBe(form.Id);
        read.Name.ShouldBe(name);
        read.ActiveVersionNumber.ShouldBe(1);
        read.UpdatedAt.ShouldBe(saved.UpdatedAt);
        read.ShouldHoldDefinition(Second);
    }

    [Fact]
    [Trait("Case", "FRM-071")]
    public async Task Another_definition_on_a_form_not_used_replaces_the_one_version_row()
    {
        var admin = await Login.SharedSuperAdminAsync();
        var form = await Data.Form().WithDefinition(First);

        await admin.SaveAsync(form.Id, Unique.Name("Saved", "محفوظ"), Second);

        var version = (await App.VersionsAsync(form.Id)).ShouldHaveSingleItem();
        version.Number.ShouldBe(1);
        version.Definition.ShouldBe(Second);
        (await App.FormStateAsync(form.Id)).ActiveVersionNumber.ShouldBe(1);
    }

    [Fact]
    [Trait("Case", "FRM-072")]
    public async Task The_same_definition_and_another_name_change_the_name_and_leave_the_version_row()
    {
        var admin = await Login.SharedSuperAdminAsync();
        var form = await Data.Form().WithDefinition(First);
        var before = await App.VersionsAsync(form.Id);
        var name = Unique.Name("Renamed", "معدل");

        Clock.Advance(FormSaveKit.Later);
        var saved = await admin.SaveAsync(form.Id, name, First);

        saved.Name.ShouldBe(name);
        saved.ShouldHoldDefinition(First);
        (await App.FormStateAsync(form.Id)).Name.ShouldBe(name);
        (await App.VersionsAsync(form.Id)).ShouldBe(before);
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    [Trait("Case", "FRM-073")]
    public async Task Reordered_keys_and_other_whitespace_change_no_version_row(bool used)
    {
        const string spelling = """{"a":1,"b":{"c":[1,2],"d":"x"}}""";
        const string respelled = """
            {
                "b" : { "d" : "x",   "c" : [ 1, 2 ] },
                "a" : 1
            }
            """;
        var admin = await Login.SharedSuperAdminAsync();
        var form = await admin.CreateAsync(spelling);
        if (used)
            Usage.MarkUsed(form.Id);
        var before = await App.VersionsAsync(form.Id);

        Clock.Advance(FormSaveKit.Later);
        var saved = await admin.SaveAsync(form.Id, form.Name, respelled);

        saved.ActiveVersionNumber.ShouldBe(1);
        var rows = await App.VersionsAsync(form.Id);
        rows.ShouldBe(before);
        rows[0].Definition.ShouldBe(spelling, "the stored text is still the first spelling");
    }

    [Fact]
    [Trait("Case", "FRM-074")]
    public async Task One_and_one_point_zero_count_as_unchanged()
    {
        var admin = await Login.SharedSuperAdminAsync();
        var form = await admin.CreateAsync("""{"a":1}""");
        var before = await App.VersionsAsync(form.Id);

        Clock.Advance(FormSaveKit.Later);
        await admin.SaveAsync(form.Id, form.Name, """{"a":1.0}""");

        var rows = await App.VersionsAsync(form.Id);
        rows.ShouldBe(before);
        rows[0].Definition.ShouldBe("""{"a":1}""");
    }

    [Fact]
    [Trait("Case", "FRM-079")]
    public async Task A_save_with_nothing_changed_still_moves_updatedAt_in_the_answer_and_the_list()
    {
        var admin = await Login.SharedSuperAdminAsync();
        var form = await Data.Form().WithDefinition(First);
        var versions = await App.VersionsAsync(form.Id);

        Clock.Advance(FormSaveKit.Later);
        var saved = await admin.SaveAsync(form.Id, form.Name, First);

        saved.UpdatedAt.ShouldNotBe(form.UpdatedAt);
        saved.UpdatedAt.ShouldBe(Now);
        (await admin.SummaryAsync(form.Id, form.Name)).UpdatedAt.ShouldBe(Now);
        (await App.FormStateAsync(form.Id)).UpdatedAt.ShouldBe(Now);
        (await App.VersionsAsync(form.Id)).ShouldBe(versions, "only the form is stamped");
    }

    [Fact]
    [Trait("Case", "FRM-080")]
    public async Task A_change_of_the_definition_alone_moves_the_forms_updatedAt()
    {
        var admin = await Login.SharedSuperAdminAsync();
        var form = await Data.Form().WithDefinition(First);

        Clock.Advance(FormSaveKit.Later);
        var saved = await admin.SaveAsync(form.Id, form.Name, Second);

        saved.UpdatedAt.ShouldNotBe(form.UpdatedAt);
        saved.UpdatedAt.ShouldBe(Now);
        (await admin.SummaryAsync(form.Id, form.Name)).UpdatedAt.ShouldBe(Now);
        (await App.FormStateAsync(form.Id)).UpdatedAt.ShouldBe(Now);
    }

    [Fact]
    [Trait("Case", "FRM-081")]
    public async Task No_such_id_answers_not_found_and_writes_nothing()
    {
        var admin = await Login.SharedSuperAdminAsync();
        await Data.Form();
        var before = await RowCountsAsync();

        var response = await admin.PutRawAsync(int.MaxValue, Unique.Name("Saved", "محفوظ"), Second);

        await response.ShouldBeProblemAsync(HttpStatusCode.NotFound, "notFound");
        (await App.FormRowAsync(int.MaxValue)).ShouldBeNull();
        (await App.VersionRowsAsync(int.MaxValue)).ShouldBeEmpty();
        (await RowCountsAsync()).ShouldBe(before);
    }

    [Fact]
    [Trait("Case", "FRM-081")]
    public async Task A_deleted_form_answers_not_found_and_writes_nothing()
    {
        var admin = await Login.SharedSuperAdminAsync();
        var form = await Data.Form().WithDefinition(First).Deleted();
        var state = await App.FormStateAsync(form.Id);
        var versions = await App.VersionsAsync(form.Id);

        Clock.Advance(FormSaveKit.Later);
        var response = await admin.PutRawAsync(form.Id, Unique.Name("Saved", "محفوظ"), Second);

        await response.ShouldBeProblemAsync(HttpStatusCode.NotFound, "notFound");
        (await App.FormStateAsync(form.Id)).ShouldBe(state);
        (await App.VersionsAsync(form.Id)).ShouldBe(versions);
    }

    [Fact]
    [Trait("Case", "FRM-083")]
    public async Task Of_two_saves_in_a_row_the_last_ones_name_and_definition_stay()
    {
        var admin = await Login.SharedSuperAdminAsync();
        var form = await Data.Form().WithDefinition(First);
        var last = Unique.Name("Last", "الأخير");

        await admin.SaveAsync(form.Id, Unique.Name("Earlier", "الأسبق"), Second);
        await admin.SaveAsync(form.Id, last, First);

        var read = await admin.DetailsAsync(form.Id);
        read.Name.ShouldBe(last);
        read.ShouldHoldDefinition(First);
        (await App.FormStateAsync(form.Id)).Name.ShouldBe(last);
        (await App.VersionsAsync(form.Id)).ShouldHaveSingleItem().Definition.ShouldBe(First);
    }

    [Fact]
    [Trait("Case", "FRM-154")]
    public async Task A_definition_at_the_exact_limit_saved_unchanged_leaves_the_version_row()
    {
        const int limit = 1_048_576;
        var definition = "{\"a\":\"" + new string('x', limit - 8) + "\"}";
        Encoding.UTF8.GetByteCount(definition).ShouldBe(limit, "the test's own definition");
        var admin = await Login.SharedSuperAdminAsync();
        var form = await admin.CreateAsync(definition);
        var before = await App.VersionsAsync(form.Id);

        Clock.Advance(FormSaveKit.Later);
        await admin.SaveAsync(form.Id, form.Name, definition);

        var rows = await App.VersionsAsync(form.Id);
        rows.ShouldBe(before);
        rows.ShouldHaveSingleItem().Definition.ShouldBe(definition);
    }

    [Theory]
    [InlineData("""{"a":"أ"}""", """{"a":"أ"}""")]
    [InlineData("""{"ab":1}""", """{"ab":1}""")]
    [InlineData("""{"a":1e2}""", """{"a":100}""")]
    [InlineData("""{"a":0}""", """{"a":-0}""")]
    [Trait("Case", "FRM-156")]
    public async Task The_same_value_spelled_otherwise_writes_no_version_row(string spelling, string respelled)
    {
        var admin = await Login.SharedSuperAdminAsync();
        var form = await admin.CreateAsync(spelling);
        var before = await App.VersionsAsync(form.Id);

        Clock.Advance(FormSaveKit.Later);
        await admin.SaveAsync(form.Id, form.Name, respelled);

        var rows = await App.VersionsAsync(form.Id);
        rows.ShouldBe(before);
        rows[0].Definition.ShouldBe(spelling);
    }

    [Theory]
    [InlineData("""{"a":[1,2]}""", """{"a":[2,1]}""")]
    [InlineData("""{"a":1,"a":2}""", """{"a":2,"a":1}""")]
    [InlineData("""{"a":0.1234567890123456789012}""", """{"a":0.1234567890123456789013}""")]
    [InlineData("""{"a":1}""", """{"A":1}""")]
    [Trait("Case", "FRM-157")]
    public async Task A_real_difference_counts_as_changed(string saved, string sent)
    {
        var admin = await Login.SharedSuperAdminAsync();
        var form = await admin.CreateAsync(saved);

        Clock.Advance(FormSaveKit.Later);
        await admin.SaveAsync(form.Id, form.Name, sent);

        var version = (await App.VersionsAsync(form.Id)).ShouldHaveSingleItem();
        version.Definition.ShouldBe(sent);
        version.UpdatedAt.ShouldBe(Now);
    }

    [Fact]
    [Trait("Case", "FRM-159")]
    public async Task A_stored_null_escape_saved_unchanged_writes_no_version_row()
    {
        const string spelling = """{"a":"x\u0000y"}""";
        var admin = await Login.SharedSuperAdminAsync();
        var form = await admin.CreateAsync(spelling);
        var before = await App.VersionsAsync(form.Id);

        Clock.Advance(FormSaveKit.Later);
        await admin.SaveAsync(form.Id, form.Name, """{ "a" : "x\u0000y" }""");

        var rows = await App.VersionsAsync(form.Id);
        rows.ShouldBe(before);
        rows[0].Definition.ShouldBe(spelling);
    }

    [Fact]
    [Trait("Case", "FRM-165")]
    public async Task A_failing_usage_check_answers_unexpected_and_writes_nothing()
    {
        var admin = await Login.SharedSuperAdminAsync();
        var form = await Data.Form().WithDefinition(First);
        var state = await App.FormStateAsync(form.Id);
        var versions = await App.VersionsAsync(form.Id);
        Usage.ThrowOnCheck = true;

        Clock.Advance(FormSaveKit.Later);
        var response = await admin.PutRawAsync(form.Id, Unique.Name("Saved", "محفوظ"), Second);

        await response.ShouldBeProblemAsync(HttpStatusCode.InternalServerError, "unexpected");
        (await App.FormStateAsync(form.Id)).ShouldBe(state);
        (await App.VersionsAsync(form.Id)).ShouldBe(versions);
    }

    private Task<(int Forms, int Versions)> RowCountsAsync() =>
        App.QueryDbAsync(async db => (await db.Forms.CountAsync(), await db.FormVersions.CountAsync()));
}

/// <summary>A version row, every column but the form's id.</summary>
internal sealed record VersionRow(int Number, string Definition, DateTime CreatedAt, DateTime UpdatedAt);

/// <summary>A <c>Forms</c> row, every column the domain carries but its id.</summary>
internal sealed record FormRowState(string Name, int ActiveVersionNumber, bool IsDeleted, DateTime? DeletedAt, DateTime CreatedAt, DateTime UpdatedAt);

/// <summary>What <see cref="FormSaveTests"/> and <see cref="FormVersioningTests"/> share: saves over HTTP that assert their status, and rows as comparable values.</summary>
internal static class FormSaveKit
{
    /// <summary>How far a test moves the clock before a save: well inside the access token's life.</summary>
    public static readonly TimeSpan Later = TimeSpan.FromMinutes(1);

    /// <summary>A POST with the definition's text as written, for spelling and size.</summary>
    public static async Task<FormDetails> CreateAsync(this ApiClient admin, string definitionJson)
    {
        var response = await admin.PostRawAsync(Unique.Name("Form", "نموذج"), definitionJson);
        await response.ShouldBeAsync(HttpStatusCode.Created);
        return await response.ReadAsync<FormDetails>();
    }

    public static async Task<FormDetails> SaveAsync(this ApiClient admin, int id, string name, string definitionJson)
    {
        var response = await admin.PutRawAsync(id, name, definitionJson);
        await response.ShouldBeOkAsync();
        return await response.ReadAsync<FormDetails>();
    }

    public static async Task<FormDetails> DetailsAsync(this ApiClient admin, int id)
    {
        var response = await admin.GetAsync(FormsApi.Item(id));
        await response.ShouldBeOkAsync();
        return await response.ReadAsync<FormDetails>();
    }

    /// <summary>The form's row in the list, found by searching its name.</summary>
    public static async Task<FormSummary> SummaryAsync(this ApiClient admin, int id, string name)
    {
        var response = await admin.GetAsync($"{FormsApi.Route}?search={Uri.EscapeDataString(name)}&pageSize=100");
        await response.ShouldBeOkAsync();
        var page = await response.ReadAsync<PagedResult<FormSummary>>();
        return page.Items.Where(item => item.Id == id).ShouldHaveSingleItem();
    }

    /// <summary>The definition in an answer, as JSON (the answer re-serializes: spelling is read in the rows).</summary>
    public static void ShouldHoldDefinition(this FormDetails form, string definitionJson)
    {
        using var expected = JsonDocument.Parse(definitionJson);
        JsonElement.DeepEquals(form.Definition, expected.RootElement).ShouldBeTrue($"expected {definitionJson}, answered {form.Definition.GetRawText()}");
    }

    /// <summary>The form's versions by number.</summary>
    public static async Task<List<VersionRow>> VersionsAsync(this AppFixture app, int formId) =>
        (await app.VersionRowsAsync(formId)).Select(v => new VersionRow(v.VersionNumber, v.Definition, v.CreatedAt, v.UpdatedAt)).ToList();

    public static async Task<FormRowState> FormStateAsync(this AppFixture app, int id)
    {
        var form = await app.FormRowAsync(id);
        form.ShouldNotBeNull();
        return new FormRowState(form.Name, form.ActiveVersionNumber, form.IsDeleted, form.DeletedAt, form.CreatedAt, form.UpdatedAt);
    }
}
