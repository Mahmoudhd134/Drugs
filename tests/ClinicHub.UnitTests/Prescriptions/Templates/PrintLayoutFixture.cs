using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.Json.Serialization;
using ClinicHub.Application.Features.Prescriptions.Templates;

namespace ClinicHub.UnitTests.Prescriptions.Templates;

/// <summary>One row of <c>tests/fixtures/print-layout-cases.json</c> (schema: <c>tests/fixtures/README.md</c>).</summary>
public sealed record PrintLayoutCase(IReadOnlyList<string> Ids, string Name, bool Valid, JsonObject Layout, IReadOnlyList<PrintLayoutError> Errors)
{
    public override string ToString() => Name;
}

public sealed record PrintLayoutError(string Field, string Code);

public sealed record PrintLayoutRounding(decimal Value, decimal Rounded);

/// <summary>Reads the shared rule rows (copied next to the test assembly by the csproj).</summary>
public static class PrintLayoutFixture
{
    private static readonly string[] Fields = ["ids", "name", "valid", "layout", "errors"];

    /// <summary>The API's JSON options (web defaults), strict about unknown fields so a typo in the fixture fails.</summary>
    private static readonly JsonSerializerOptions ApiJson = new(JsonSerializerDefaults.Web)
    {
        UnmappedMemberHandling = JsonUnmappedMemberHandling.Disallow,
    };

    private static readonly Lazy<JsonNode> Root = new(() =>
        JsonNode.Parse(File.ReadAllText(Path.Combine(AppContext.BaseDirectory, "fixtures", "print-layout-cases.json"))));

    private static readonly Lazy<IReadOnlyList<PrintLayoutCase>> LoadedCases = new(LoadCases);

    public static IReadOnlyList<PrintLayoutCase> Cases => LoadedCases.Value;

    public static IReadOnlyList<PrintLayoutRounding> Rounding =>
        Root.Value["rounding"].Deserialize<List<PrintLayoutRounding>>(ApiJson);

    public static IEnumerable<object[]> CaseNames() => Cases.Select(c => new object[] { c.Name });

    public static PrintLayoutCase Find(string name) => Cases.Single(c => c.Name == name);

    public static PrescriptionLayoutDto ToLayout(PrintLayoutCase row) => row.Layout.Deserialize<PrescriptionLayoutDto>(ApiJson);

    private static IReadOnlyList<PrintLayoutCase> LoadCases() =>
        Root.Value["cases"].AsArray().Select(node =>
        {
            var row = node.AsObject();
            var unknown = row.Select(p => p.Key).Except(Fields).ToList();
            if (unknown.Count > 0)
                throw new InvalidDataException($"print-layout-cases.json: unknown field(s) {string.Join(", ", unknown)}");
            return new PrintLayoutCase(
                row["ids"].Deserialize<List<string>>(),
                (string)row["name"],
                (bool)row["valid"],
                row["layout"].AsObject(),
                row["errors"].Deserialize<List<PrintLayoutError>>(ApiJson));
        }).ToList();
}
