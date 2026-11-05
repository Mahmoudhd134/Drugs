using System.Net;
using System.Text.Json;
using System.Text.Json.Nodes;
using ClinicHub.IntegrationTests.Harness.Assertions;
using ClinicHub.IntegrationTests.Harness.Hosting;
using Shouldly;

namespace ClinicHub.IntegrationTests.Admin.PrescriptionTemplates;

/// <summary>
/// Every row of the shared <c>tests/fixtures/print-layout-cases.json</c> as a real PUT: its <c>layout</c> is "the body as the
/// API takes it", its <c>errors</c> "the API's full list for it" (fixtures README). A refused row replaces nothing.
/// </summary>
[Collection(AdminCollection7.Name)]
[Trait("Area", "admin")]
public class PrintLayoutFixtureApiTests(AppFixture app) : IntegrationTest(app)
{
    private sealed record Row(string Name, bool Valid, JsonObject Layout, List<RowError> Errors);

    private sealed record RowError(string Field, string Code);

    private static readonly Lazy<List<Row>> Rows = new(() =>
    {
        const string relative = "tests/fixtures/print-layout-cases.json";
        for (var dir = new DirectoryInfo(AppContext.BaseDirectory); dir is not null; dir = dir.Parent)
        {
            var path = Path.Combine(dir.FullName, relative);
            if (File.Exists(path))
                return JsonNode.Parse(File.ReadAllText(path))["cases"].AsArray().Select(node => new Row(
                    (string)node["name"],
                    (bool)node["valid"],
                    node["layout"].AsObject(),
                    node["errors"].Deserialize<List<RowError>>(Json.Options))).ToList();
        }

        throw new InvalidOperationException($"{relative} not found above {AppContext.BaseDirectory}");
    });

    public static TheoryData<string> RowNames => new(Rows.Value.Select(r => r.Name));

    [Theory]
    [MemberData(nameof(RowNames))]
    [Trait("Case", "TPL-048")]
    public async Task The_API_answers_every_fixture_row_exactly_its_errors(string name)
    {
        var row = Rows.Value.Single(r => r.Name == name);
        var admin = await Login.SharedSuperAdminAsync();
        var clinic = await App.PerClassAsync("fixture:clinic", () => Data.Clinic().CreateAsync());
        await admin.SaveTemplateAsync(clinic.Id, LayoutBuilder.L());
        var before = await App.TemplateRowAsync(clinic.Id);

        var response = await admin.PutRawTemplateAsync(clinic.Id, row.Layout.ToJsonString());

        if (row.Valid)
        {
            await response.ShouldBeOkAsync();
            (await admin.ReadTemplateAsync(clinic.Id)).Layout.Items.Select(i => i.Id)
                .ShouldBe(row.Layout["items"].AsArray().Select(i => (string)i["id"]));
            return;
        }

        var problem = await response.ShouldBeProblemAsync(HttpStatusCode.BadRequest, row.Errors[0].Code);
        problem.Errors.Select(e => (e.Field, e.Code)).ShouldBe(row.Errors.Select(e => (e.Field, e.Code)));
        (await App.TemplateRowAsync(clinic.Id)).Layout.ShouldBe(before.Layout);
    }
}
