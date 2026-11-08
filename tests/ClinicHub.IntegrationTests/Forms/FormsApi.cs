using System.Text.Json;
using ClinicHub.Domain.Forms;
using ClinicHub.IntegrationTests.Harness.Clients;
using ClinicHub.IntegrationTests.Harness.Hosting;
using Microsoft.EntityFrameworkCore;

namespace ClinicHub.IntegrationTests.Forms;

/// <summary>
/// The forms routes (contract § 1) and raw access to their rows. A definition is passed as its JSON text and sent as written, so spelling, size, depth and invalid values reach
/// the server as a test means them.
/// </summary>
public static class FormsApi
{
    public const string Route = "/api/v1/admin/forms";

    public const string EmptyDefinition = """{"schemaVersion":1,"dir":"rtl","nodes":[]}""";

    public static string Item(int id) => $"{Route}/{id}";

    /// <summary>The body with <paramref name="definitionJson"/> as written; null leaves the key out.</summary>
    public static string RawBody(string name, string definitionJson) =>
        definitionJson is null
            ? $$"""{"name":{{JsonSerializer.Serialize(name)}}}"""
            : $$"""{"name":{{JsonSerializer.Serialize(name)}},"definition":{{definitionJson}}}""";

    public static Task<HttpResponseMessage> PostRawAsync(this ApiClient client, string name, string definitionJson) =>
        client.SendRawAsync(HttpMethod.Post, Route, RawBody(name, definitionJson));

    public static Task<HttpResponseMessage> PutRawAsync(this ApiClient client, int id, string name, string definitionJson) =>
        client.SendRawAsync(HttpMethod.Put, Item(id), RawBody(name, definitionJson));

    /// <summary>The five routes, each sent as the given client with a valid body, for the access cases. <paramref name="id"/> is any id.</summary>
    public static IReadOnlyList<Func<ApiClient, Task<HttpResponseMessage>>> EveryRoute(int id) =>
    [
        client => client.GetAsync(Route),
        client => client.GetAsync(Item(id)),
        client => client.PostRawAsync("Form", EmptyDefinition),
        client => client.PutRawAsync(id, "Form", EmptyDefinition),
        client => client.DeleteAsync(Item(id)),
    ];

    /// <summary>The form's row, deleted or not; null when there is none.</summary>
    public static Task<Form> FormRowAsync(this AppFixture app, int id) =>
        app.QueryDbAsync(db => db.Forms.AsNoTracking().SingleOrDefaultAsync(f => f.Id == id));

    /// <summary>The form's versions by number.</summary>
    public static Task<List<FormVersion>> VersionRowsAsync(this AppFixture app, int formId) =>
        app.QueryDbAsync(db => db.FormVersions.AsNoTracking().Where(v => v.FormId == formId).OrderBy(v => v.VersionNumber).ToListAsync());
}
