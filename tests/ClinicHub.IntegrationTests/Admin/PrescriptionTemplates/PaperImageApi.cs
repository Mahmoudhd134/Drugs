using ClinicHub.Application.Features.Attachments.Files;
using ClinicHub.Domain.Attachments;
using ClinicHub.IntegrationTests.Attachments.TestHost;
using ClinicHub.IntegrationTests.Harness.Clients;
using ClinicHub.IntegrationTests.Harness.Hosting;
using Microsoft.EntityFrameworkCore;

namespace ClinicHub.IntegrationTests.Admin.PrescriptionTemplates;

/// <summary>
/// The picture's six routes on the real app (step 4 contract § 8.3). Uploads go through <see cref="AttachmentRequests"/> and
/// <see cref="MultipartBody"/>, bytes come from <see cref="FileSamples"/> (the server checks the signature, never the body), and the
/// disk is <c>new AttachmentDisk(App.Factory.AttachmentRoot)</c>.
/// </summary>
public static class PaperImageApi
{
    public static string Route(int clinicId) => $"{LayoutBuilder.Route(clinicId)}/paper-image";

    public static string Rules(int clinicId) => $"{Route(clinicId)}/rules";

    public static string Item(int clinicId, Guid id) => $"{Route(clinicId)}/{id}";

    /// <summary>The upload's limit in the base config: <c>Attachments:Modules:clinicPaper:MaxFileSizeMb</c>, 10 MB (P2).</summary>
    public const int LimitBytes = 10 * 1_048_576;

    /// <summary>The owner's reference on a row (<c>PaperImageOwner.RefId</c>).</summary>
    public const string RefId = "current";

    /// <summary>A raw row saved before step 4: no <c>calibration</c> key (TPL-605). For <see cref="SaveRawLayoutAsync"/>.</summary>
    public const string RowBeforeStep4 =
        """{"schemaVersion":1,"page":{"size":"A5","widthMm":148,"heightMm":210},"items":[{"id":"t1","kind":"prescriptionText","xMm":14,"yMm":80,"wMm":120,"hMm":90,"fontSizePt":11}]}""";

    /// <summary>The six routes, each sent as the given client, for the access cases (TPL-667 to TPL-669). <paramref name="id"/> is any id.</summary>
    public static IReadOnlyList<Func<ApiClient, Task<HttpResponseMessage>>> EveryRoute(int clinicId, Guid id) =>
    [
        client => client.GetAsync(Rules(clinicId)),
        client => client.GetAsync(Route(clinicId)),
        client => client.UploadAsync(Route(clinicId), "paper.png", FileSamples.Png()),
        client => client.ReplaceAsync(Item(clinicId, id), "paper.png", FileSamples.Png()),
        client => client.GetAsync(Item(clinicId, id)),
        client => client.DeleteAsync(Item(clinicId, id)),
    ];

    /// <summary>POST, asserting it stored the file; the answer.</summary>
    public static Task<AttachmentDto> UploadPaperAsync(this ApiClient client, int clinicId, string fileName = "paper.png", byte[] bytes = null) =>
        client.StoredAsync(Route(clinicId), fileName, bytes ?? FileSamples.Png());

    /// <summary>GET, asserting 200: the live rows, newest first.</summary>
    public static Task<List<AttachmentDto>> PaperImagesAsync(this ApiClient client, int clinicId) =>
        client.ListedAsync(Route(clinicId));

    /// <summary>Every picture row of the clinic, deleted ones too, by the database: no clinic filter.</summary>
    public static Task<List<Attachment>> PaperRowsAsync(this AppFixture app, int clinicId) =>
        app.QueryDbAsync(db => db.Attachments.IgnoreQueryFilters().AsNoTracking()
            .Where(a => a.ClinicId == clinicId && a.Module == AttachmentModules.ClinicPaper && a.RefId == RefId).ToListAsync());

    /// <summary>Overwrites the clinic's template row with this raw JSON, as an older version left it: save a template first.</summary>
    public static async Task SaveRawLayoutAsync(this AppFixture app, int clinicId, string json)
    {
        var updated = await app.QueryDbAsync(db => db.PrescriptionTemplates.IgnoreQueryFilters().Where(t => t.ClinicId == clinicId)
            .ExecuteUpdateAsync(setters => setters.SetProperty(t => t.Layout, json)));
        if (updated != 1)
            throw new InvalidOperationException($"Clinic {clinicId} has no template row to overwrite: save one first.");
    }
}
