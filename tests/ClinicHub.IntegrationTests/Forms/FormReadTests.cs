using System.Net;
using ClinicHub.IntegrationTests.Harness.Assertions;
using ClinicHub.IntegrationTests.Harness.Hosting;
using Shouldly;

namespace ClinicHub.IntegrationTests.Forms;

/// <summary><c>GET /admin/forms/{id}</c> and the ids that never reach a form (contract A2, A6).</summary>
[Collection(FormsCollection.Name)]
[Trait("Area", "forms")]
public class FormReadTests(AppFixture app) : FormApiTest(app)
{
    [Fact]
    [Trait("Case", "FRM-020")]
    public async Task A_form_reads_back_with_the_summary_fields_and_the_definition_as_saved()
    {
        var admin = await AdminAsync();
        const string definition = """{"schemaVersion":1,"dir":"ltr","nodes":[{"type":"text","name":"age","required":true}]}""";
        var name = $"Read {Tag()}";
        var form = await Data.Form().Named(name).WithDefinition(definition);

        var read = await GetFormAsync(admin, form.Id);

        read.Id.ShouldBe(form.Id);
        read.Name.ShouldBe(name);
        read.ActiveVersionNumber.ShouldBe(1);
        read.UpdatedAt.ShouldBe(Now);
        ShouldBeTheSameJson(read.Definition, definition);
    }

    [Fact]
    [Trait("Case", "FRM-021")]
    public async Task An_id_with_no_form_answers_notFound()
    {
        var admin = await AdminAsync();

        await (await admin.GetAsync(FormsApi.Item(int.MaxValue))).ShouldBeProblemAsync(HttpStatusCode.NotFound, "notFound");
    }

    [Fact]
    [Trait("Case", "FRM-022")]
    public async Task A_deleted_form_answers_notFound()
    {
        var admin = await AdminAsync();
        var form = await Data.Form().Deleted();

        await (await admin.GetAsync(FormsApi.Item(form.Id))).ShouldBeProblemAsync(HttpStatusCode.NotFound, "notFound");
    }

    [Fact]
    [Trait("Case", "FRM-023")]
    public async Task The_keys_of_a_definition_read_back_exactly_as_sent()
    {
        var admin = await AdminAsync();
        const string definition = """{"PascalKey":1,"snake_key":{"InnerPascal":true,"inner_snake":[{"DeepKey":"x"}]}}""";
        var form = await Data.Form().WithDefinition(definition);

        var read = await GetFormAsync(admin, form.Id);

        read.Definition.EnumerateObject().Select(key => key.Name).ShouldBe(["PascalKey", "snake_key"]);
        var inner = read.Definition.GetProperty("snake_key");
        inner.EnumerateObject().Select(key => key.Name).ShouldBe(["InnerPascal", "inner_snake"]);
        inner.GetProperty("inner_snake")[0].EnumerateObject().Select(key => key.Name).ShouldBe(["DeepKey"]);
    }

    private async Task EveryRouteOfTheIdAnswersNotFoundAsync(string id)
    {
        var admin = await AdminAsync();
        var url = $"{FormsApi.Route}/{id}";

        await (await admin.GetAsync(url)).ShouldBeProblemAsync(HttpStatusCode.NotFound, "notFound");
        await (await admin.SendRawAsync(HttpMethod.Put, url, FormsApi.RawBody("Form", FormsApi.EmptyDefinition)))
            .ShouldBeProblemAsync(HttpStatusCode.NotFound, "notFound");
        await (await admin.DeleteAsync(url)).ShouldBeProblemAsync(HttpStatusCode.NotFound, "notFound");
    }

    [Theory]
    [Trait("Case", "FRM-132")]
    [InlineData("abc")]
    [InlineData("1.5")]
    [InlineData("2147483648")]
    public Task An_id_that_is_not_an_int_answers_notFound_on_get_put_and_delete(string id) => EveryRouteOfTheIdAnswersNotFoundAsync(id);

    [Theory]
    [Trait("Case", "FRM-133")]
    [InlineData("0")]
    [InlineData("-1")]
    public Task An_id_of_0_or_below_answers_notFound_on_get_put_and_delete(string id) => EveryRouteOfTheIdAnswersNotFoundAsync(id);
}
