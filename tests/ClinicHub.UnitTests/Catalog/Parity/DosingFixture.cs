using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.Json.Serialization;
using ClinicHub.Domain.Catalog;

namespace ClinicHub.UnitTests.Catalog.Parity;

/// <summary>One row of <c>tests/fixtures/dosing-cases.json</c> (schema: <c>tests/fixtures/README.md</c>).</summary>
public sealed record DosingCase(
    IReadOnlyList<string> Ids,
    string Name,
    string Owner,
    JsonObject Input,
    bool Valid,
    IReadOnlyList<DosingCaseError> Errors,
    bool HasNormalized,
    JsonNode Normalized,
    bool ApiOnly)
{
    public const string DrugDefault = "drugDefault";
    public const string ProtocolLine = "groupLine";

    public override string ToString() => Name;
}

public sealed record DosingCaseError(string Field, string Code);

/// <summary>Reads the parity fixture (copied next to the test assembly by the csproj).</summary>
public static class DosingFixture
{
    private static readonly string[] Fields = ["ids", "name", "owner", "input", "valid", "errors", "normalized", "apiOnly", "ar"];

    /// <summary>The API's JSON options (web defaults), strict about unknown fields so a typo in the fixture fails.</summary>
    public static readonly JsonSerializerOptions ApiJson = new(JsonSerializerDefaults.Web)
    {
        UnmappedMemberHandling = JsonUnmappedMemberHandling.Disallow,
    };

    /// <summary>For comparing normalized dosings: only the fields that are set.</summary>
    private static readonly JsonSerializerOptions SetFieldsOnly = new(JsonSerializerDefaults.Web)
    {
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
    };

    private static readonly Lazy<IReadOnlyList<DosingCase>> Loaded = new(Load);

    public static IReadOnlyList<DosingCase> Cases => Loaded.Value;

    public static IEnumerable<object[]> CaseNames() => Cases.Select(c => new object[] { c.Name });

    public static DosingCase Find(string name) => Cases.Single(c => c.Name == name);

    public static Dosing ToDosing(JsonNode node) => node?.Deserialize<Dosing>(ApiJson);

    /// <summary>The set fields of a dosing as JSON text ("null" = no dosing).</summary>
    public static string SetFields(Dosing dosing) => dosing is null ? "null" : JsonSerializer.Serialize(dosing, SetFieldsOnly);

    private static IReadOnlyList<DosingCase> Load()
    {
        var path = Path.Combine(AppContext.BaseDirectory, "fixtures", "dosing-cases.json");
        var root = JsonNode.Parse(File.ReadAllText(path));
        return root["cases"].AsArray().Select(node =>
        {
            var row = node.AsObject();
            var unknown = row.Select(p => p.Key).Except(Fields).ToList();
            if (unknown.Count > 0)
                throw new InvalidDataException($"dosing-cases.json: unknown field(s) {string.Join(", ", unknown)}");
            return new DosingCase(
                row["ids"].Deserialize<List<string>>(),
                (string)row["name"],
                (string)row["owner"],
                row["input"].AsObject(),
                (bool)row["valid"],
                row["errors"]?.Deserialize<List<DosingCaseError>>(ApiJson),
                row.ContainsKey("normalized"),
                row["normalized"],
                (bool?)row["apiOnly"] ?? false);
        }).ToList();
    }
}
