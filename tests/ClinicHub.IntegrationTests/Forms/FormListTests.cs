using System.Net;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using ClinicHub.Application.Common.Paging;
using ClinicHub.Application.Features.Forms.Definitions;
using ClinicHub.IntegrationTests.Harness.Assertions;
using ClinicHub.IntegrationTests.Harness.Builders;
using ClinicHub.IntegrationTests.Harness.Clients;
using ClinicHub.IntegrationTests.Harness.Hosting;
using Microsoft.EntityFrameworkCore;
using Shouldly;

namespace ClinicHub.IntegrationTests.Forms;

/// <summary>What the classes on the plain app share: the session, a form's row state, and definitions of a chosen shape.</summary>
public abstract class FormApiTest(AppFixture app) : IntegrationTest(app)
{
    /// <summary>The super admin in no clinic. Get it before any <c>Clock.Advance</c>.</summary>
    protected Task<ApiClient> AdminAsync() => Login.SharedSuperAdminAsync();

    /// <summary>A text no other form holds, and not part of another tag.</summary>
    protected static string Tag() => $"frmq{Unique.Next()}x";

    protected DateTime Now => Clock.GetUtcNow().UtcDateTime;

    protected Task<(int Forms, int Versions)> RowCountsAsync() =>
        App.QueryDbAsync(async db => (await db.Forms.CountAsync(), await db.FormVersions.CountAsync()));

    /// <summary>Every column of the form and its versions, to compare before and after.</summary>
    protected async Task<string> StateAsync(int id)
    {
        var form = await App.FormRowAsync(id);
        form.ShouldNotBeNull();
        var versions = await App.VersionRowsAsync(id);
        var row = $"{form.Name}|{form.ActiveVersionNumber}|{form.IsDeleted}|{form.DeletedAt:O}|{form.CreatedAt:O}|{form.UpdatedAt:O}";
        return string.Join("\n", versions.Select(v => $"{v.VersionNumber}|{v.Definition}|{v.CreatedAt:O}|{v.UpdatedAt:O}").Prepend(row));
    }

    protected static async Task<FormDetails> ShouldBeCreatedAsync(HttpResponseMessage response)
    {
        await response.ShouldBeAsync(HttpStatusCode.Created);
        return await response.ReadAsync<FormDetails>();
    }

    protected static async Task<FormDetails> ShouldBeSavedAsync(HttpResponseMessage response)
    {
        await response.ShouldBeOkAsync();
        return await response.ReadAsync<FormDetails>();
    }

    protected static async Task<FormDetails> GetFormAsync(ApiClient admin, int id)
    {
        var response = await admin.GetAsync(FormsApi.Item(id));
        await response.ShouldBeOkAsync();
        return await response.ReadAsync<FormDetails>();
    }

    protected static void ShouldBeTheSameJson(JsonElement actual, string expected)
    {
        using var document = JsonDocument.Parse(expected);
        JsonElement.DeepEquals(actual, document.RootElement).ShouldBeTrue($"expected {expected}, got {actual.GetRawText()}");
    }

    /// <summary>An object of exactly <paramref name="levels"/> levels, the innermost one empty.</summary>
    protected static string Nested(int levels) =>
        string.Concat(Enumerable.Repeat("""{"a":""", levels - 1)) + "{}" + new string('}', levels - 1);

    /// <summary>An object whose JSON text is exactly <paramref name="bytes"/> UTF-8 bytes, all of it ASCII.</summary>
    protected static string DefinitionOfBytes(int bytes)
    {
        var json = $$"""{"k":"{{new string('x', bytes - 8)}}"}""";
        Encoding.UTF8.GetByteCount(json).ShouldBe(bytes);
        return json;
    }
}

/// <summary>
/// <c>GET /admin/forms</c> (contract A1). The tests of the class share the table, so each one searches its own tag, or walks every page and looks at its own forms only.
/// </summary>
[Collection(FormsCollection.Name)]
[Trait("Area", "forms")]
public class FormListTests(AppFixture app) : FormApiTest(app)
{
    private static string Search(string term, string more = "pageSize=100") => $"?search={Uri.EscapeDataString(term)}&{more}";

    private static async Task<PagedResult<FormSummary>> ListAsync(ApiClient admin, string query)
    {
        var response = await admin.GetAsync(FormsApi.Route + query);
        await response.ShouldBeOkAsync();
        return await response.ReadAsync<PagedResult<FormSummary>>();
    }

    private static async Task<List<JsonObject>> EveryFormAsync(ApiClient admin)
    {
        var forms = new List<JsonObject>();
        for (var page = 1; ; page++)
        {
            var response = await admin.GetAsync($"{FormsApi.Route}?page={page}&pageSize=100");
            await response.ShouldBeOkAsync();
            var items = (await response.ReadNodeAsync())["items"].AsArray();
            forms.AddRange(items.Select(item => item.AsObject()));
            if (items.Count < 100)
                return forms;
        }
    }

    private static int[] Ids(PagedResult<FormSummary> page) => page.Items.Select(form => form.Id).ToArray();

    /// <summary>A search that filters nothing answers the very list that no search answers.</summary>
    private static async Task ShouldListEveryFormAsync(ApiClient admin, string query)
    {
        var all = await ListAsync(admin, "?pageSize=100");
        all.TotalCount.ShouldBeGreaterThan(0);

        var searched = await ListAsync(admin, query);

        searched.TotalCount.ShouldBe(all.TotalCount);
        Ids(searched).ShouldBe(Ids(all));
    }

    /// <summary>
    /// A real update moves the older row behind the younger one in the table, so without the sort's "then id" the database would answer the younger one first.
    /// </summary>
    private async Task RewriteAsync(ApiClient admin, FormDetails form)
    {
        Clock.Advance(TimeSpan.FromMinutes(1));
        await ShouldBeSavedAsync(await admin.PutRawAsync(form.Id, form.Name, FormsApi.EmptyDefinition));
    }

    [Fact]
    [Trait("Case", "FRM-001")]
    public async Task Listing_answers_the_forms_in_name_order_with_the_summary_fields_and_no_definition()
    {
        var admin = await AdminAsync();
        var tag = Tag();
        var b = await Data.Form().Named($"{tag} B");
        var a = await Data.Form().Named($"{tag} A");

        var own = (await EveryFormAsync(admin)).Where(form => form["name"].GetValue<string>().StartsWith(tag, StringComparison.Ordinal)).ToList();

        own.Select(form => form["id"].GetValue<int>()).ShouldBe([a.Id, b.Id]);
        own.Select(form => form["name"].GetValue<string>()).ShouldBe([$"{tag} A", $"{tag} B"]);
        foreach (var form in own)
        {
            form.Select(property => property.Key).ShouldBe(["id", "name", "activeVersionNumber", "updatedAt"], ignoreOrder: true);
            form["activeVersionNumber"].GetValue<int>().ShouldBe(1);
            form["updatedAt"].GetValue<DateTime>().ShouldBe(Now);
        }
    }

    [Fact]
    [Trait("Case", "FRM-003")]
    public async Task A_deleted_form_is_neither_listed_nor_counted()
    {
        var admin = await AdminAsync();
        var tag = Tag();
        var live = await Data.Form().Named($"{tag} live");
        var deleted = await Data.Form().Named($"{tag} deleted").Deleted();

        var searched = await ListAsync(admin, Search(tag));
        Ids(searched).ShouldBe([live.Id]);
        searched.TotalCount.ShouldBe(1);

        var every = await EveryFormAsync(admin);
        every.Select(form => form["id"].GetValue<int>()).ShouldContain(live.Id);
        every.Select(form => form["id"].GetValue<int>()).ShouldNotContain(deleted.Id);
        (await ListAsync(admin, "?pageSize=1")).TotalCount.ShouldBe(every.Count);
    }

    [Fact]
    [Trait("Case", "FRM-005")]
    public async Task A_page_of_0_and_a_size_of_1000_answer_page_1_and_size_100()
    {
        var admin = await AdminAsync();
        await Data.Form();

        var page = await ListAsync(admin, "?page=0&pageSize=1000");

        page.Page.ShouldBe(1);
        page.PageSize.ShouldBe(100);
        page.Items.ShouldNotBeEmpty();
    }

    [Fact]
    [Trait("Case", "FRM-006")]
    public async Task A_search_lists_the_names_starting_with_it_first_and_nothing_when_none_matches()
    {
        var admin = await AdminAsync();
        var tag = Tag();
        var zeta = await Data.Form().Named($"Zeta {tag}");
        var starting = await Data.Form().Named($"{char.ToUpperInvariant(tag[0])}{tag[1..]} alpha");
        // Comes before it by name alone: only the "starting with it first" rule puts it behind
        var aardvark = await Data.Form().Named($"Aardvark {tag}");

        var found = await ListAsync(admin, Search(tag));

        Ids(found).ShouldBe([starting.Id, aardvark.Id, zeta.Id]);
        found.TotalCount.ShouldBe(3);

        var none = await ListAsync(admin, Search(Tag()));
        none.Items.ShouldBeEmpty();
        none.TotalCount.ShouldBe(0);
    }

    [Fact]
    [Trait("Case", "FRM-007")]
    public async Task A_search_finds_an_arabic_name_written_with_another_form_of_the_letter()
    {
        var admin = await AdminAsync();
        var tag = Tag();
        var form = await Data.Form().Named($"أشعة {tag}");

        var found = await ListAsync(admin, Search($"اشعة {tag}"));

        Ids(found).ShouldBe([form.Id]);
    }

    [Fact]
    [Trait("Case", "FRM-008")]
    public async Task Two_forms_with_the_same_name_come_by_id()
    {
        var admin = await AdminAsync();
        var name = $"Twin {Tag()}";
        var older = await Data.Form().Named(name);
        var younger = await Data.Form().Named(name);
        await RewriteAsync(admin, older);

        var own = (await EveryFormAsync(admin)).Where(form => form["name"].GetValue<string>() == name);

        own.Select(form => form["id"].GetValue<int>()).ShouldBe([older.Id, younger.Id]);
    }

    [Fact]
    [Trait("Case", "FRM-009")]
    public async Task A_search_of_only_spaces_lists_every_form()
    {
        var admin = await AdminAsync();
        await Data.Form();

        await ShouldListEveryFormAsync(admin, Search("   "));
    }

    [Fact]
    [Trait("Case", "FRM-139")]
    public async Task A_size_of_0_answers_size_1_and_a_page_of_minus_1_answers_page_1()
    {
        var admin = await AdminAsync();
        await Data.Form();
        await Data.Form();

        var sized = await ListAsync(admin, "?pageSize=0");
        sized.PageSize.ShouldBe(1);
        sized.Items.Count.ShouldBe(1);

        (await ListAsync(admin, "?page=-1")).Page.ShouldBe(1);
    }

    [Theory]
    [Trait("Case", "FRM-140")]
    [InlineData("page=2&pageSize=20")]
    [InlineData("page=2147483647&pageSize=100")]
    public async Task A_page_past_the_end_is_empty_with_the_right_total(string paging)
    {
        var admin = await AdminAsync();
        var tag = Tag();
        await Data.Form().Named($"{tag} only");

        var page = await ListAsync(admin, Search(tag, paging));

        page.Items.ShouldBeEmpty();
        page.TotalCount.ShouldBe(1);
    }

    [Theory]
    [Trait("Case", "FRM-141")]
    [InlineData("page=abc")]
    [InlineData("pageSize=99999999999")]
    public async Task A_paging_value_that_is_not_an_int_answers_invalidRequest(string paging)
    {
        var admin = await AdminAsync();

        var response = await admin.GetAsync($"{FormsApi.Route}?{paging}");

        await response.ShouldBeProblemAsync(HttpStatusCode.BadRequest, "invalidRequest");
    }

    [Theory]
    [Trait("Case", "FRM-142")]
    [InlineData("%")]
    [InlineData("_")]
    [InlineData("\\")]
    public async Task A_search_with_a_pattern_character_matches_it_literally(string character)
    {
        var admin = await AdminAsync();
        var tag = Tag();
        var form = await Data.Form().Named($"{tag} 1{character}2");
        await Data.Form().Named($"{tag} 1x2");
        await Data.Form().Named($"{tag} 12");

        var found = await ListAsync(admin, Search($"{tag} 1{character}2"));
        Ids(found).ShouldBe([form.Id]);
        found.TotalCount.ShouldBe(1);

        var alone = await ListAsync(admin, Search(character));
        alone.Items.ShouldAllBe(item => item.Name.Contains(character));
        Ids(alone).ShouldContain(form.Id);
    }

    [Fact]
    [Trait("Case", "FRM-143")]
    public async Task A_search_of_a_NUL_lists_every_form_and_a_NUL_after_a_term_is_ignored()
    {
        var admin = await AdminAsync();
        var tag = Tag();
        var form = await Data.Form().Named($"{tag} nul");

        await ShouldListEveryFormAsync(admin, "?search=%00&pageSize=100");

        Ids(await ListAsync(admin, $"?search={tag}%00&pageSize=100")).ShouldBe([form.Id]);
    }

    [Theory]
    [Trait("Case", "FRM-144")]
    [InlineData("\u0640")]
    [InlineData("\u0650\u0651")]
    public async Task A_search_of_only_a_tatweel_or_diacritics_lists_every_form(string term)
    {
        var admin = await AdminAsync();
        await Data.Form();

        await ShouldListEveryFormAsync(admin, Search(term));
    }

    [Fact]
    [Trait("Case", "FRM-145")]
    public async Task A_deleted_match_is_neither_on_a_page_nor_in_the_total()
    {
        var admin = await AdminAsync();
        var tag = Tag();
        var one = await Data.Form().Named($"{tag} 1");
        var two = await Data.Form().Named($"{tag} 2");
        var three = await Data.Form().Named($"{tag} 3");
        var deleted = await Data.Form().Named($"{tag} 0").Deleted();

        var first = await ListAsync(admin, Search(tag, "pageSize=2"));
        var second = await ListAsync(admin, Search(tag, "pageSize=2&page=2"));

        first.TotalCount.ShouldBe(3);
        second.TotalCount.ShouldBe(3);
        Ids(first).Concat(Ids(second)).ShouldBe([one.Id, two.Id, three.Id]);
        Ids(first).Concat(Ids(second)).ShouldNotContain(deleted.Id);
    }

    [Fact]
    [Trait("Case", "FRM-146")]
    public async Task A_name_starting_with_the_folded_term_comes_before_one_only_containing_it()
    {
        var admin = await AdminAsync();
        var tag = Tag();
        var report = await Data.Form().Named($"تقرير اشعة {tag}");
        var starting = await Data.Form().Named($"أشعة {tag} ب");
        // Latin letters sort before Arabic ones: by name alone it would come first
        var latin = await Data.Form().Named($"Aa اشعة {tag}");

        var found = await ListAsync(admin, Search($"اشعة {tag}"));

        Ids(found)[0].ShouldBe(starting.Id);
        Ids(found).ShouldBe([starting.Id, latin.Id, report.Id], ignoreOrder: true);
        found.TotalCount.ShouldBe(3);
    }

    [Fact]
    [Trait("Case", "FRM-146")]
    public async Task Two_names_starting_with_the_term_come_by_name()
    {
        var admin = await AdminAsync();
        var tag = Tag();
        var b = await Data.Form().Named($"أشعة {tag} b");
        var a = await Data.Form().Named($"أشعة {tag} a");

        Ids(await ListAsync(admin, Search($"اشعة {tag}"))).ShouldBe([a.Id, b.Id]);
    }

    [Fact]
    [Trait("Case", "FRM-146")]
    public async Task Two_forms_with_the_same_name_starting_with_the_term_come_by_id()
    {
        var admin = await AdminAsync();
        var name = $"أشعة {Tag()}";
        var older = await Data.Form().Named(name);
        var younger = await Data.Form().Named(name);
        await RewriteAsync(admin, older);

        Ids(await ListAsync(admin, Search(name))).ShouldBe([older.Id, younger.Id]);
    }

    [Theory]
    [Trait("Case", "FRM-147")]
    [InlineData(false)]
    [InlineData(true)]
    public async Task A_renamed_form_is_found_by_its_new_folded_name_and_not_by_its_old_one(bool definitionChanges)
    {
        var admin = await AdminAsync();
        var oldTag = Tag();
        var newTag = Tag();
        var form = await Data.Form().Named($"Old {oldTag}");

        await ShouldBeSavedAsync(await admin.PutRawAsync(form.Id, $"أشعة {newTag}", definitionChanges ? """{"changed":true}""" : FormsApi.EmptyDefinition));

        Ids(await ListAsync(admin, Search($"اشعة {newTag}"))).ShouldBe([form.Id]);
        (await ListAsync(admin, Search(oldTag))).Items.ShouldBeEmpty();
    }
}

/// <summary>The one test of its class, so it runs right after the reset of a new class and the table is really empty.</summary>
[Collection(FormsCollection.Name)]
[Trait("Area", "forms")]
public class FormListOnAnEmptyTableTests(AppFixture app) : FormApiTest(app)
{
    [Fact]
    [Trait("Case", "FRM-002")]
    [Trait("Case", "FRM-004")]
    public async Task With_no_form_the_list_is_empty_and_with_3_the_second_page_of_2_holds_the_last_one()
    {
        var admin = await AdminAsync();

        var empty = await admin.GetAsync(FormsApi.Route);
        await empty.ShouldBeOkAsync();
        var none = await empty.ReadAsync<PagedResult<FormSummary>>();
        none.Items.ShouldBeEmpty();
        none.TotalCount.ShouldBe(0);

        await Data.Form().Named("Page A");
        await Data.Form().Named("Page B");
        var last = await Data.Form().Named("Page C");

        var response = await admin.GetAsync($"{FormsApi.Route}?pageSize=2&page=2");
        await response.ShouldBeOkAsync();
        var page = await response.ReadAsync<PagedResult<FormSummary>>();

        page.Items.Select(form => form.Id).ShouldBe([last.Id]);
        page.TotalCount.ShouldBe(3);
        page.Page.ShouldBe(2);
        page.PageSize.ShouldBe(2);
    }
}
