using System.Net;
using System.Text.Json.Nodes;
using ClinicHub.IntegrationTests.Harness.Assertions;
using ClinicHub.IntegrationTests.Harness.Hosting;
using Shouldly;

namespace ClinicHub.IntegrationTests.Forms;

/// <summary><c>POST /admin/forms</c> (contract A3, A8, § 3).</summary>
[Collection(FormsCollection.Name)]
[Trait("Area", "forms")]
public class FormCreateTests(AppFixture app) : FormApiTest(app)
{
    private static string LocationPath(HttpResponseMessage response)
    {
        response.Headers.Location.ShouldNotBeNull();
        return response.Headers.Location.IsAbsoluteUri ? response.Headers.Location.AbsolutePath : response.Headers.Location.OriginalString;
    }

    [Fact]
    [Trait("Case", "FRM-030")]
    public async Task A_valid_form_answers_201_with_its_location_and_version_1_and_a_get_answers_the_same()
    {
        var admin = await AdminAsync();
        var name = $"Create {Tag()}";
        const string definition = """{"schemaVersion":1,"dir":"rtl","nodes":[{"type":"text"}]}""";

        var response = await admin.PostRawAsync(name, definition);

        var created = await ShouldBeCreatedAsync(response);
        created.Id.ShouldBeGreaterThan(0);
        created.Name.ShouldBe(name);
        created.ActiveVersionNumber.ShouldBe(1);
        created.UpdatedAt.ShouldBe(Now);
        ShouldBeTheSameJson(created.Definition, definition);
        LocationPath(response).ShouldBe(FormsApi.Item(created.Id));

        var read = await admin.GetAsync(FormsApi.Item(created.Id));
        await read.ShouldBeOkAsync();
        JsonNode.DeepEquals(await read.ReadNodeAsync(), await response.ReadNodeAsync()).ShouldBeTrue();
    }

    [Fact]
    [Trait("Case", "FRM-031")]
    public async Task A_new_form_has_one_version_row_number_1_and_is_not_deleted()
    {
        var admin = await AdminAsync();
        const string definition = """{"schemaVersion":1,"nodes":[]}""";

        var created = await ShouldBeCreatedAsync(await admin.PostRawAsync($"Rows {Tag()}", definition));

        var form = await App.FormRowAsync(created.Id);
        form.ShouldNotBeNull();
        form.ActiveVersionNumber.ShouldBe(1);
        form.IsDeleted.ShouldBeFalse();
        form.DeletedAt.ShouldBeNull();
        var version = (await App.VersionRowsAsync(created.Id)).ShouldHaveSingleItem();
        version.VersionNumber.ShouldBe(1);
        version.Definition.ShouldBe(definition);
    }

    [Fact]
    [Trait("Case", "FRM-032")]
    public async Task The_name_of_an_existing_form_can_be_used_and_both_exist()
    {
        var admin = await AdminAsync();
        var name = $"Same {Tag()}";
        var first = await Data.Form().Named(name);

        var second = await ShouldBeCreatedAsync(await admin.PostRawAsync(name, FormsApi.EmptyDefinition));

        second.Id.ShouldNotBe(first.Id);
        (await GetFormAsync(admin, first.Id)).Name.ShouldBe(name);
        (await GetFormAsync(admin, second.Id)).Name.ShouldBe(name);
    }

    [Fact]
    [Trait("Case", "FRM-033")]
    public async Task The_name_of_a_deleted_form_can_be_used_and_the_deleted_form_stays_deleted()
    {
        var admin = await AdminAsync();
        var name = $"Reused {Tag()}";
        var deleted = await Data.Form().Named(name).Deleted();

        var created = await ShouldBeCreatedAsync(await admin.PostRawAsync(name, FormsApi.EmptyDefinition));

        created.Id.ShouldNotBe(deleted.Id);
        created.Name.ShouldBe(name);
        (await App.FormRowAsync(deleted.Id)).IsDeleted.ShouldBeTrue();
    }

    [Fact]
    [Trait("Case", "FRM-034")]
    public async Task The_name_is_answered_and_stored_trimmed()
    {
        var admin = await AdminAsync();
        var name = $"Trim {Tag()}";

        var created = await ShouldBeCreatedAsync(await admin.PostRawAsync($"  {name}  ", FormsApi.EmptyDefinition));

        created.Name.ShouldBe(name);
        (await App.FormRowAsync(created.Id)).Name.ShouldBe(name);
    }

    [Theory]
    [Trait("Case", "FRM-048")]
    [InlineData("{}")]
    [InlineData("""{"dir":"rtl"}""")]
    [InlineData("""{"schemaVersion":99,"nodes":[{"type":"from the future","x":{"y":[1,null,false]}}]}""")]
    public async Task A_definition_is_accepted_whatever_is_inside_and_reads_back_as_sent(string definition)
    {
        var admin = await AdminAsync();

        var created = await ShouldBeCreatedAsync(await admin.PostRawAsync($"Inside {Tag()}", definition));

        ShouldBeTheSameJson((await GetFormAsync(admin, created.Id)).Definition, definition);
        (await App.VersionRowsAsync(created.Id)).ShouldHaveSingleItem().Definition.ShouldBe(definition);
    }

    [Fact]
    [Trait("Case", "FRM-051")]
    public async Task A_NUL_escape_in_a_string_is_saved_and_reads_back()
    {
        var admin = await AdminAsync();
        const string definition = """{"k":"a\u0000b"}""";

        var created = await ShouldBeCreatedAsync(await admin.PostRawAsync($"Nul {Tag()}", definition));

        (await GetFormAsync(admin, created.Id)).Definition.GetProperty("k").GetString().ShouldBe("a\0b");
        (await App.VersionRowsAsync(created.Id)).ShouldHaveSingleItem().Definition.ShouldBe(definition);
    }

    [Fact]
    [Trait("Case", "FRM-137")]
    public async Task Two_identical_posts_make_two_forms_with_one_version_each()
    {
        var admin = await AdminAsync();
        var name = $"Twice {Tag()}";

        var first = await ShouldBeCreatedAsync(await admin.PostRawAsync(name, FormsApi.EmptyDefinition));
        var second = await ShouldBeCreatedAsync(await admin.PostRawAsync(name, FormsApi.EmptyDefinition));

        second.Id.ShouldNotBe(first.Id);
        (await App.VersionRowsAsync(first.Id)).ShouldHaveSingleItem();
        (await App.VersionRowsAsync(second.Id)).ShouldHaveSingleItem();
    }

    [Fact]
    [Trait("Case", "FRM-138")]
    public async Task A_duplicate_is_a_separate_form_and_saving_one_leaves_the_other_as_it_was()
    {
        var admin = await AdminAsync();
        const string definition = """{"schemaVersion":1,"nodes":[{"type":"text"}]}""";
        var original = await Data.Form().WithDefinition(definition);
        var active = await GetFormAsync(admin, original.Id);

        var copy = await ShouldBeCreatedAsync(await admin.PostRawAsync($"Copy {Tag()}", active.Definition.GetRawText()));
        copy.Id.ShouldNotBe(original.Id);
        ShouldBeTheSameJson(copy.Definition, definition);
        var originalBefore = await StateAsync(original.Id);

        Clock.Advance(TimeSpan.FromMinutes(1));
        await ShouldBeSavedAsync(await admin.PutRawAsync(copy.Id, copy.Name, """{"changed":"the copy"}"""));

        (await StateAsync(original.Id)).ShouldBe(originalBefore);

        var copyBefore = await StateAsync(copy.Id);
        Clock.Advance(TimeSpan.FromMinutes(1));
        await ShouldBeSavedAsync(await admin.PutRawAsync(original.Id, original.Name, """{"changed":"the original"}"""));

        (await StateAsync(copy.Id)).ShouldBe(copyBefore);
    }

    [Fact]
    [Trait("Case", "FRM-151")]
    public async Task The_stored_text_is_exactly_the_text_sent()
    {
        var admin = await AdminAsync();
        const string definition = "{  \"z\" : 1.50,\n\t\"a\":\"\\u0623 أ\" ,\r\n \"\\u006b\" : [ 1 , { } ]   }";

        var created = await ShouldBeCreatedAsync(await admin.PostRawAsync($"Exact {Tag()}", definition));

        (await App.VersionRowsAsync(created.Id)).ShouldHaveSingleItem().Definition.ShouldBe(definition);
    }

    [Fact]
    [Trait("Case", "FRM-155")]
    public async Task A_definition_at_the_readers_deepest_level_is_saved_and_one_level_more_is_refused()
    {
        var admin = await AdminAsync();
        // The body's own object is one level
        var deepest = Nested(31);

        var created = await ShouldBeCreatedAsync(await admin.PostRawAsync($"Deep {Tag()}", deepest));

        ShouldBeTheSameJson((await GetFormAsync(admin, created.Id)).Definition, deepest);

        var before = (await App.VersionRowsAsync(created.Id)).ShouldHaveSingleItem();
        Clock.Advance(TimeSpan.FromMinutes(1));
        await ShouldBeSavedAsync(await admin.PutRawAsync(created.Id, created.Name, deepest));
        var after = (await App.VersionRowsAsync(created.Id)).ShouldHaveSingleItem();
        after.Definition.ShouldBe(deepest);
        after.UpdatedAt.ShouldBe(before.UpdatedAt);

        var counts = await RowCountsAsync();
        await (await admin.PostRawAsync($"Too deep {Tag()}", Nested(32))).ShouldBeProblemAsync(HttpStatusCode.BadRequest, "invalidRequest");
        (await RowCountsAsync()).ShouldBe(counts);
    }

    [Fact]
    [Trait("Case", "FRM-158")]
    public async Task Duplicate_keys_and_numbers_no_double_can_hold_read_back_with_their_text_intact()
    {
        var admin = await AdminAsync();
        const string definition = """{"a":1,"a":2,"huge":1e400,"long":12345678901234567890123}""";

        var created = await ShouldBeCreatedAsync(await admin.PostRawAsync($"Numbers {Tag()}", definition));

        var read = await admin.GetAsync(FormsApi.Item(created.Id));
        (await read.ShouldBeOkAsync()).ShouldContain(definition);
    }
}
