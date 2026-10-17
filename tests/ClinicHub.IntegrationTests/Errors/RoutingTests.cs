using System.Net;
using ClinicHub.IntegrationTests.Harness.Assertions;
using ClinicHub.IntegrationTests.Harness.Clients;
using ClinicHub.IntegrationTests.Harness.Hosting;
using Shouldly;

namespace ClinicHub.IntegrationTests.Errors;

/// <summary>
/// Unknown routes and wrong methods answer ProblemDetails; client routes get the SPA, <c>/api</c> never does
/// (tech overview § Errors and § Runtime architecture).
/// </summary>
[Collection(ErrorsCollection2.Name)]
[Trait("Area", "errors")]
public class RoutingTests(AppFixture app) : IntegrationTest(app)
{
    private const string SpaMarker = "<title>ClinicHub SPA (test)</title>";

    [Fact]
    [Trait("Tier", "Smoke")]
    [Trait("Case", "ERR-015")]
    public async Task An_unknown_api_route_is_a_404_problem()
    {
        var response = await (await OwnerAsync()).GetAsync("/api/v1/unknown");

        var problem = await response.ShouldBeProblemAsync(HttpStatusCode.NotFound, "notFound");
        ProblemShape.ShouldHaveTheShape(problem.Body, HttpStatusCode.NotFound, "notFound", "/api/v1/unknown");
    }

    [Fact]
    [Trait("Case", "ERR-016")]
    public async Task Another_method_on_an_unknown_api_route_is_a_405_problem()
    {
        var response = await (await OwnerAsync()).PostAsync("/api/v1/unknown", new { });

        var problem = await response.ShouldBeProblemAsync(HttpStatusCode.MethodNotAllowed, "methodNotAllowed");
        ProblemShape.ShouldHaveTheShape(problem.Body, HttpStatusCode.MethodNotAllowed, "methodNotAllowed", "/api/v1/unknown");
    }

    [Fact]
    [Trait("Case", "ERR-017")]
    public async Task A_wrong_method_on_a_known_route_is_a_405_problem()
    {
        var owner = await OwnerAsync();

        var patch = await owner.SendAsync(new HttpRequestMessage(HttpMethod.Patch, "/api/v1/drugs/1"));
        var delete = await owner.DeleteAsync("/api/v1/permissions");

        var first = await patch.ShouldBeProblemAsync(HttpStatusCode.MethodNotAllowed, "methodNotAllowed");
        ProblemShape.ShouldHaveTheShape(first.Body, HttpStatusCode.MethodNotAllowed, "methodNotAllowed", "/api/v1/drugs/1");
        var second = await delete.ShouldBeProblemAsync(HttpStatusCode.MethodNotAllowed, "methodNotAllowed");
        ProblemShape.ShouldHaveTheShape(second.Body, HttpStatusCode.MethodNotAllowed, "methodNotAllowed", "/api/v1/permissions");
    }

    // Every {id:int} route with "abc" in its int segment: the methods its template has → 404 notFound (the route is a
    // candidate for the method, its constraint fails), and GET always (the SPA fallback is a GET candidate, as for
    // ERR-015); the other methods → 405 methodNotAllowed (no candidate for the method, as for ERR-016)
    [Theory]
    [Trait("Case", "ERR-018")]
    [InlineData("/api/v1/drugs/abc", "GET PUT DELETE", "POST PATCH")]
    [InlineData("/api/v1/drugs/abc/groups", "GET", "POST PUT DELETE PATCH")]
    [InlineData("/api/v1/drug-groups/abc", "GET PUT DELETE", "POST PATCH")]
    [InlineData("/api/v1/admin/clinics/abc", "GET PUT DELETE", "POST PATCH")]
    [InlineData("/api/v1/admin/clinics/abc/suspend", "POST GET", "PUT DELETE PATCH")]
    [InlineData("/api/v1/admin/clinics/abc/activate", "POST GET", "PUT DELETE PATCH")]
    [InlineData("/api/v1/admin/clinics/abc/roles", "GET POST", "PUT DELETE PATCH")]
    [InlineData("/api/v1/admin/clinics/1/roles/abc", "PUT DELETE GET", "POST PATCH")]
    [InlineData("/api/v1/admin/clinics/abc/staff", "GET POST", "PUT DELETE PATCH")]
    [InlineData("/api/v1/admin/clinics/1/staff/abc", "PUT DELETE GET", "POST PATCH")]
    public async Task An_id_that_is_not_a_whole_number_is_404_for_the_routes_methods_and_get_and_405_for_the_others(
        string url, string notFoundMethods, string methodNotAllowedMethods)
    {
        var client = url.StartsWith("/api/v1/admin/") ? await Login.SharedSuperAdminAsync() : await OwnerAsync();

        foreach (var (methods, status, code) in new[]
                 {
                     (notFoundMethods, HttpStatusCode.NotFound, "notFound"),
                     (methodNotAllowedMethods, HttpStatusCode.MethodNotAllowed, "methodNotAllowed"),
                 })
        {
            foreach (var method in methods.Split(' '))
            {
                var request = new HttpRequestMessage(new HttpMethod(method), url);
                if (method is not ("GET" or "DELETE"))
                    request.Content = new StringContent("""{"name":"Tobradex"}""", System.Text.Encoding.UTF8, "application/json");

                var response = await client.SendAsync(request);

                response.StatusCode.ShouldBe(status, $"{method} {url}");
                var problem = await response.ShouldBeProblemAsync(status, code);
                ProblemShape.ShouldHaveTheShape(problem.Body, status, code, url);
            }
        }
    }

    [Fact]
    [Trait("Case", "ERR-015")]
    [Trait("Case", "ERR-019")]
    public async Task With_the_spa_built_client_routes_get_index_html_and_api_routes_never_do()
    {
        var webRoot = Directory.CreateDirectory(Path.Combine(Path.GetTempPath(), "clinichub-spa-" + Guid.NewGuid().ToString("N")));
        try
        {
            await File.WriteAllTextAsync(Path.Combine(webRoot.FullName, "index.html"),
                $"<!doctype html><html><head>{SpaMarker}</head><body><div id=\"root\"></div></body></html>");
            // The API serving a built SPA (wwwroot), as in production
            await using var variant = App.CreateVariant(new Dictionary<string, string> { ["webroot"] = webRoot.FullName });
            variant.Start();
            using var browser = new ApiClient(variant);

            foreach (var path in new[] { "/drugs", "/groups/5", "/admin/clinics/3" })
            {
                var page = await browser.GetAsync(path);
                var html = await page.ShouldBeOkAsync();
                page.Content.Headers.ContentType!.MediaType.ShouldBe("text/html");
                html.ShouldContain(SpaMarker);
            }

            var unknown = await browser.GetAsync("/api/v1/unknown");
            var problem = await unknown.ShouldBeProblemAsync(HttpStatusCode.NotFound, "notFound");
            problem.Body.ToJsonString().ShouldNotContain("ClinicHub SPA");
        }
        finally
        {
            webRoot.Delete(recursive: true);
        }
    }

    private async Task<ApiClient> OwnerAsync() =>
        await Login.SharedAsync("owner", async () => await Login.OwnerAsync(await Data.Clinic()));
}
