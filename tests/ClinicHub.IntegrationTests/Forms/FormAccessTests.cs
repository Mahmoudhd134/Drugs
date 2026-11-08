using System.Net;
using ClinicHub.IntegrationTests.Harness.Assertions;
using ClinicHub.IntegrationTests.Harness.Hosting;
using Microsoft.AspNetCore.Routing;
using Microsoft.Extensions.DependencyInjection;
using Shouldly;

namespace ClinicHub.IntegrationTests.Forms;

/// <summary>Who reaches the forms' routes, and which routes there are (contract A7, D9).</summary>
[Collection(FormsCollection.Name)]
[Trait("Area", "forms")]
public class FormAccessTests(AppFixture app) : FormApiTest(app)
{
    private const string Malformed = "{bad json";

    [Fact]
    [Trait("Case", "FRM-100")]
    public async Task Without_a_token_each_of_the_five_routes_answers_unauthorized()
    {
        var form = await Data.Form();
        var before = await StateAsync(form.Id);
        var counts = await RowCountsAsync();
        var anonymous = Anonymous();
        Clock.Advance(TimeSpan.FromMinutes(1));

        foreach (var route in FormsApi.EveryRoute(form.Id))
            await (await route(anonymous)).ShouldBeProblemAsync(HttpStatusCode.Unauthorized, "unauthorized");

        (await StateAsync(form.Id)).ShouldBe(before);
        (await RowCountsAsync()).ShouldBe(counts);
    }

    [Fact]
    [Trait("Case", "FRM-101")]
    public async Task A_clinic_token_even_the_owners_is_forbidden_on_each_of_the_five_routes_and_nothing_is_written()
    {
        var clinic = await Data.Clinic();
        var owner = await Login.OwnerAsync(clinic);
        var form = await Data.Form();
        var before = await StateAsync(form.Id);
        var counts = await RowCountsAsync();
        Clock.Advance(TimeSpan.FromMinutes(1));

        foreach (var route in FormsApi.EveryRoute(form.Id))
            await (await route(owner)).ShouldBeProblemAsync(HttpStatusCode.Forbidden, "forbidden");

        (await StateAsync(form.Id)).ShouldBe(before);
        (await RowCountsAsync()).ShouldBe(counts);
    }

    [Fact]
    [Trait("Case", "FRM-102")]
    public async Task The_super_admin_in_no_clinic_goes_through_the_five_routes()
    {
        var admin = await AdminAsync();
        var tag = Tag();

        var created = await ShouldBeCreatedAsync(await admin.PostRawAsync($"{tag} journey", FormsApi.EmptyDefinition));

        var list = await admin.GetAsync($"{FormsApi.Route}?search={tag}");
        (await list.ShouldBeOkAsync()).ShouldContain($"{tag} journey");

        ShouldBeTheSameJson((await GetFormAsync(admin, created.Id)).Definition, FormsApi.EmptyDefinition);

        var saved = await ShouldBeSavedAsync(await admin.PutRawAsync(created.Id, $"{tag} renamed", """{"nodes":[1]}"""));
        saved.Name.ShouldBe($"{tag} renamed");
        ShouldBeTheSameJson(saved.Definition, """{"nodes":[1]}""");

        await (await admin.DeleteAsync(FormsApi.Item(created.Id))).ShouldBeAsync(HttpStatusCode.NoContent);
        await (await admin.GetAsync(FormsApi.Item(created.Id))).ShouldBeProblemAsync(HttpStatusCode.NotFound, "notFound");
    }

    [Fact]
    [Trait("Case", "FRM-134")]
    public async Task A_malformed_body_is_refused_for_who_is_calling_before_it_is_read()
    {
        var clinic = await Data.Clinic();
        var owner = await Login.OwnerAsync(clinic);
        var anonymous = Anonymous();
        var form = await Data.Form();

        await (await owner.SendRawAsync(HttpMethod.Post, FormsApi.Route, Malformed)).ShouldBeProblemAsync(HttpStatusCode.Forbidden, "forbidden");
        await (await owner.SendRawAsync(HttpMethod.Put, FormsApi.Item(form.Id), Malformed)).ShouldBeProblemAsync(HttpStatusCode.Forbidden, "forbidden");
        await (await anonymous.SendRawAsync(HttpMethod.Post, FormsApi.Route, Malformed)).ShouldBeProblemAsync(HttpStatusCode.Unauthorized, "unauthorized");
        await (await anonymous.SendRawAsync(HttpMethod.Put, FormsApi.Item(form.Id), Malformed)).ShouldBeProblemAsync(HttpStatusCode.Unauthorized, "unauthorized");
    }

    [Fact]
    [Trait("Case", "FRM-135")]
    public void Only_the_five_routes_exist_under_admin_forms()
    {
        var routes = App.Factory.Services.GetRequiredService<EndpointDataSource>().Endpoints
            .OfType<RouteEndpoint>()
            .Where(endpoint => endpoint.RoutePattern.RawText is { } text && text.TrimStart('/').StartsWith("api/v1/admin/forms", StringComparison.OrdinalIgnoreCase))
            .SelectMany(endpoint => (endpoint.Metadata.GetMetadata<HttpMethodMetadata>()?.HttpMethods ?? ["(any)"])
                .Select(method => $"{method} {endpoint.RoutePattern.RawText.TrimStart('/')}"))
            .ToList();

        routes.ShouldBe(
            [
                "GET api/v1/admin/forms",
                "GET api/v1/admin/forms/{id:int}",
                "POST api/v1/admin/forms",
                "PUT api/v1/admin/forms/{id:int}",
                "DELETE api/v1/admin/forms/{id:int}",
            ],
            ignoreOrder: true);
    }

    [Fact]
    [Trait("Case", "FRM-136")]
    public async Task A_post_to_an_item_or_a_put_to_the_collection_answers_methodNotAllowed()
    {
        var admin = await AdminAsync();
        var form = await Data.Form();
        var body = FormsApi.RawBody("Form", FormsApi.EmptyDefinition);

        await (await admin.SendRawAsync(HttpMethod.Post, FormsApi.Item(form.Id), body)).ShouldBeProblemAsync(HttpStatusCode.MethodNotAllowed, "methodNotAllowed");
        await (await admin.SendRawAsync(HttpMethod.Put, FormsApi.Route, body)).ShouldBeProblemAsync(HttpStatusCode.MethodNotAllowed, "methodNotAllowed");
    }
}
