using System.Net;
using System.Net.Http.Headers;
using System.Text;
using ClinicHub.Application.Features.Forms.Definitions;
using ClinicHub.IntegrationTests.Harness.Assertions;
using ClinicHub.IntegrationTests.Harness.Clients;
using ClinicHub.IntegrationTests.Harness.Hosting;
using Shouldly;

namespace ClinicHub.IntegrationTests.Forms;

/// <summary>The outer shell of a form on <c>POST</c> and <c>PUT</c> (contract § 2): the name, the definition's type, its size and whether it can be read back.</summary>
[Collection(FormsCollection.Name)]
[Trait("Area", "forms")]
public class FormShellTests(AppFixture app) : FormApiTest(app)
{
    private const int Limit = FormLimits.DefinitionMaxBytes;
    private const string ValidDefinition = "{}";

    private static Task<HttpResponseMessage> SendBytesAsync(ApiClient client, HttpMethod method, string url, byte[] body)
    {
        var content = new ByteArrayContent(body);
        content.Headers.ContentType = new MediaTypeHeaderValue("application/json");
        return client.SendAsync(new HttpRequestMessage(method, url) { Content = content });
    }

    private static async Task ShouldBeRefusedAsync(HttpResponseMessage response, string code, string field)
    {
        var problem = await response.ShouldBeProblemAsync(HttpStatusCode.BadRequest, code);
        if (field is not null)
            problem.Errors.Select(error => (error.Code, error.Field)).ShouldBe([(code, field)]);
    }

    /// <summary>
    /// The body answers 400 on POST and on PUT of an existing form, and neither writes a row. With a <paramref name="field"/>, the code is the answer's only error.
    /// </summary>
    private async Task RefusedOnPostAndPutAsync(byte[] body, string code, string field)
    {
        var admin = await AdminAsync();
        var form = await Data.Form();
        var before = await StateAsync(form.Id);
        var counts = await RowCountsAsync();
        Clock.Advance(TimeSpan.FromMinutes(1));

        await ShouldBeRefusedAsync(await SendBytesAsync(admin, HttpMethod.Post, FormsApi.Route, body), code, field);
        (await RowCountsAsync()).ShouldBe(counts);

        await ShouldBeRefusedAsync(await SendBytesAsync(admin, HttpMethod.Put, FormsApi.Item(form.Id), body), code, field);
        (await StateAsync(form.Id)).ShouldBe(before);
        (await RowCountsAsync()).ShouldBe(counts);
    }

    private Task RefusedOnPostAndPutAsync(string body, string code, string field) => RefusedOnPostAndPutAsync(Encoding.UTF8.GetBytes(body), code, field);

    private Task NameRefusedAsync(string name, string code) => RefusedOnPostAndPutAsync(FormsApi.RawBody(name, ValidDefinition), code, "name");

    private Task DefinitionRefusedAsync(string definitionJson, string code) => RefusedOnPostAndPutAsync(FormsApi.RawBody($"Form {Tag()}", definitionJson), code, "definition");

    private async Task ShouldBeAcceptedOrTooLargeAsync(string definition, bool accepted)
    {
        var admin = await AdminAsync();

        var response = await admin.PostRawAsync($"Written {Tag()}", definition);

        if (accepted)
            await ShouldBeCreatedAsync(response);
        else
            await ShouldBeRefusedAsync(response, "formDefinitionTooLarge", "definition");
    }

    [Theory]
    [Trait("Case", "FRM-040")]
    [InlineData("""{"definition":{}}""")]
    [InlineData("""{"name":"","definition":{}}""")]
    [InlineData("""{"name":"   ","definition":{}}""")]
    public Task A_missing_empty_or_blank_name_answers_nameRequired(string body) => RefusedOnPostAndPutAsync(body, "nameRequired", "name");

    [Theory]
    [Trait("Case", "FRM-041")]
    [InlineData("a\u0001b")]
    [InlineData("a\nb")]
    public Task A_name_with_a_control_character_answers_nameInvalid(string name) => NameRefusedAsync(name, "nameInvalid");

    [Fact]
    [Trait("Case", "FRM-042")]
    public async Task A_name_of_256_characters_after_trimming_is_accepted_on_post_and_put()
    {
        var admin = await AdminAsync();
        var name = new string('a', 256);

        var created = await ShouldBeCreatedAsync(await admin.PostRawAsync($"  {name}  ", ValidDefinition));
        (await App.FormRowAsync(created.Id)).Name.ShouldBe(name);

        var form = await Data.Form();
        await ShouldBeSavedAsync(await admin.PutRawAsync(form.Id, $"  {name}  ", ValidDefinition));
        (await App.FormRowAsync(form.Id)).Name.ShouldBe(name);
    }

    [Fact]
    [Trait("Case", "FRM-042")]
    public Task A_name_of_257_characters_answers_nameTooLong() => NameRefusedAsync(new string('a', 257), "nameTooLong");

    [Fact]
    [Trait("Case", "FRM-148")]
    public async Task An_arabic_name_of_256_letters_with_spaces_around_it_is_accepted_and_stored_trimmed()
    {
        var admin = await AdminAsync();
        var name = new string('ب', 256);
        var form = await Data.Form();

        var saved = await ShouldBeSavedAsync(await admin.PutRawAsync(form.Id, $"  {name}  ", ValidDefinition));

        saved.Name.ShouldBe(name);
        (await App.FormRowAsync(form.Id)).Name.ShouldBe(name);
    }

    [Fact]
    [Trait("Case", "FRM-148")]
    public Task An_arabic_name_of_257_letters_is_refused() => NameRefusedAsync(new string('ب', 257), "nameTooLong");

    [Fact]
    [Trait("Case", "FRM-043")]
    public Task A_missing_definition_answers_formDefinitionInvalid() => DefinitionRefusedAsync(null, "formDefinitionInvalid");

    [Theory]
    [Trait("Case", "FRM-044")]
    [InlineData("null")]
    [InlineData("\"text\"")]
    [InlineData("5")]
    [InlineData("true")]
    [InlineData("false")]
    [InlineData("[]")]
    [InlineData("[{}]")]
    public Task A_definition_that_is_not_an_object_answers_formDefinitionInvalid(string definitionJson) => DefinitionRefusedAsync(definitionJson, "formDefinitionInvalid");

    [Fact]
    [Trait("Case", "FRM-045")]
    public async Task A_definition_of_exactly_the_limit_is_accepted_on_post_and_put()
    {
        var admin = await AdminAsync();
        var definition = DefinitionOfBytes(Limit);

        var created = await ShouldBeCreatedAsync(await admin.PostRawAsync($"Limit {Tag()}", definition));
        ((await App.VersionRowsAsync(created.Id)).ShouldHaveSingleItem().Definition == definition).ShouldBeTrue();

        var form = await Data.Form();
        await ShouldBeSavedAsync(await admin.PutRawAsync(form.Id, form.Name, definition));
        ((await App.VersionRowsAsync(form.Id)).ShouldHaveSingleItem().Definition == definition).ShouldBeTrue();
    }

    [Fact]
    [Trait("Case", "FRM-045")]
    public Task A_definition_one_byte_over_the_limit_answers_formDefinitionTooLarge() => DefinitionRefusedAsync(DefinitionOfBytes(Limit + 1), "formDefinitionTooLarge");

    [Fact]
    [Trait("Case", "FRM-046")]
    public Task A_definition_under_the_limit_in_characters_but_over_it_in_bytes_is_too_large()
    {
        var definition = $$"""{"k":"{{new string('ب', 600_000)}}"}""";
        definition.Length.ShouldBeLessThan(Limit);
        Encoding.UTF8.GetByteCount(definition).ShouldBeGreaterThan(Limit);

        return DefinitionRefusedAsync(definition, "formDefinitionTooLarge");
    }

    [Fact]
    [Trait("Case", "FRM-047")]
    public async Task A_blank_name_and_an_invalid_definition_answer_both_errors_with_the_names_first()
    {
        var admin = await AdminAsync();
        var form = await Data.Form();

        foreach (var response in new[] { await admin.PostRawAsync("   ", "5"), await admin.PutRawAsync(form.Id, "   ", "5") })
        {
            var problem = await response.ShouldBeProblemAsync(HttpStatusCode.BadRequest, "nameRequired");
            problem.Errors.Select(error => (error.Code, error.Field)).ShouldBe([("nameRequired", "name"), ("formDefinitionInvalid", "definition")]);
        }
    }

    [Theory]
    [Trait("Case", "FRM-049")]
    [InlineData("{bad json")]
    [InlineData("not json at all")]
    public async Task A_body_that_is_not_JSON_answers_invalidRequest(string body)
    {
        var admin = await AdminAsync();
        var counts = await RowCountsAsync();

        await (await admin.SendRawAsync(HttpMethod.Post, FormsApi.Route, body)).ShouldBeProblemAsync(HttpStatusCode.BadRequest, "invalidRequest");

        (await RowCountsAsync()).ShouldBe(counts);
    }

    [Theory]
    [Trait("Case", "FRM-050")]
    [InlineData(32)]
    [InlineData(200)]
    [InlineData(5000)]
    public async Task A_definition_nesting_past_the_readers_depth_answers_invalidRequest(int levels)
    {
        var admin = await AdminAsync();
        var counts = await RowCountsAsync();

        await (await admin.PostRawAsync($"Deep {Tag()}", Nested(levels))).ShouldBeProblemAsync(HttpStatusCode.BadRequest, "invalidRequest");

        (await RowCountsAsync()).ShouldBe(counts);
    }

    [Fact]
    [Trait("Case", "FRM-052")]
    public async Task On_a_missing_id_an_invalid_body_answers_400_since_validation_runs_first()
    {
        var admin = await AdminAsync();

        await (await admin.PutRawAsync(int.MaxValue, "   ", ValidDefinition)).ShouldBeProblemAsync(HttpStatusCode.BadRequest, "nameRequired");
        await (await admin.PutRawAsync(int.MaxValue, "Form", "5")).ShouldBeProblemAsync(HttpStatusCode.BadRequest, "formDefinitionInvalid");
    }

    [Theory]
    [Trait("Case", "FRM-130")]
    [InlineData("""{"k":"\ud800"}""")]
    [InlineData("""{"k":"\udc00"}""")]
    [InlineData("""{"\ud800":1}""")]
    [InlineData("""{"k":["a",{"n":"\ud800x"}]}""")]
    public Task A_lone_surrogate_escape_answers_formDefinitionInvalid(string definitionJson) => DefinitionRefusedAsync(definitionJson, "formDefinitionInvalid");

    [Fact]
    [Trait("Case", "FRM-131")]
    public Task An_array_over_the_limit_answers_only_formDefinitionInvalid() =>
        DefinitionRefusedAsync($"[{string.Join(",", Enumerable.Repeat("1", Limit))}]", "formDefinitionInvalid");

    [Fact]
    [Trait("Case", "FRM-131")]
    public Task A_string_over_the_limit_answers_only_formDefinitionInvalid() =>
        DefinitionRefusedAsync($"\"{new string('x', Limit + 1)}\"", "formDefinitionInvalid");

    [Theory]
    [Trait("Case", "FRM-149")]
    [InlineData("""{"name":null,"definition":{}}""", "nameRequired", "name")]
    [InlineData("""{"name":5,"definition":{}}""", "invalidRequest", null)]
    [InlineData("""{"name":{},"definition":{}}""", "invalidRequest", null)]
    [InlineData("", "invalidRequest", null)]
    [InlineData("null", "invalidRequest", null)]
    public Task A_name_of_the_wrong_type_or_no_body_answers_400(string body, string code, string field) => RefusedOnPostAndPutAsync(body, code, field);

    [Theory]
    [Trait("Case", "FRM-150")]
    [InlineData("a\u2028b")]
    [InlineData("a\u202Eb")]
    [InlineData("a\0b")]
    public Task A_name_with_a_line_separator_an_override_or_a_NUL_answers_nameInvalid(string name) => NameRefusedAsync(name, "nameInvalid");

    [Fact]
    [Trait("Case", "FRM-152")]
    public async Task A_definition_of_exactly_the_limit_in_two_byte_letters_is_accepted_and_reads_back()
    {
        var admin = await AdminAsync();
        var letters = new string('ب', (Limit - 8) / 2);
        var definition = $$"""{"k":"{{letters}}"}""";
        Encoding.UTF8.GetByteCount(definition).ShouldBe(Limit);

        var created = await ShouldBeCreatedAsync(await admin.PostRawAsync($"Arabic {Tag()}", definition));

        ((await GetFormAsync(admin, created.Id)).Definition.GetProperty("k").GetString() == letters).ShouldBeTrue();
    }

    [Fact]
    [Trait("Case", "FRM-152")]
    public Task Two_byte_letters_one_byte_over_the_limit_are_too_large() =>
        DefinitionRefusedAsync($$"""{"k":"{{new string('ب', (Limit - 8) / 2)}}x"}""", "formDefinitionTooLarge");

    [Theory]
    [Trait("Case", "FRM-152")]
    [InlineData(0, true)]
    [InlineData(1, false)]
    public Task Inner_whitespace_counts_as_written(int over, bool accepted)
    {
        var definition = $$"""{"k":"a"{{new string(' ', Limit - 9 + over)}}}""";
        Encoding.UTF8.GetByteCount(definition).ShouldBe(Limit + over);

        return ShouldBeAcceptedOrTooLargeAsync(definition, accepted);
    }

    [Theory]
    [Trait("Case", "FRM-152")]
    [InlineData(0, true)]
    [InlineData(1, false)]
    public Task Each_escape_counts_as_its_six_characters_written(int over, bool accepted)
    {
        const int escapes = 174_761;
        var definition = $$"""{"k":"{{string.Concat(Enumerable.Repeat(@"\u0041", escapes))}}{{new string('x', Limit - 8 - (escapes * 6) + over)}}"}""";
        Encoding.UTF8.GetByteCount(definition).ShouldBe(Limit + over);

        return ShouldBeAcceptedOrTooLargeAsync(definition, accepted);
    }

    [Fact]
    [Trait("Case", "FRM-153")]
    public Task A_definition_of_5_MB_answers_formDefinitionTooLarge() => DefinitionRefusedAsync(DefinitionOfBytes(5 * 1024 * 1024), "formDefinitionTooLarge");

    [Theory]
    [Trait("Case", "FRM-170")]
    [InlineData("""{"name":"Form","definition":{"k":"a""", """b"}}""")]
    [InlineData("""{"name":"Form","definition":{"k""", """b":1}}""")]
    public Task A_raw_byte_that_is_not_UTF8_inside_a_string_answers_formDefinitionInvalid(string before, string after)
    {
        byte[] body = [.. Encoding.UTF8.GetBytes(before), 0xFF, .. Encoding.UTF8.GetBytes(after)];

        return RefusedOnPostAndPutAsync(body, "formDefinitionInvalid", "definition");
    }

    [Theory]
    [Trait("Case", "FRM-171")]
    [InlineData("""{"n":1e99999999999}""")]
    [InlineData("""{"k":[{"n":1e99999999999}]}""")]
    public Task A_number_with_an_exponent_too_large_to_compare_answers_formDefinitionInvalid(string definitionJson) => DefinitionRefusedAsync(definitionJson, "formDefinitionInvalid");
}
