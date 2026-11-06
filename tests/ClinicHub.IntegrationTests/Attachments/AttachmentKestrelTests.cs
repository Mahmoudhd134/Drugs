using System.Net;
using ClinicHub.Application.Common.Settings;
using ClinicHub.IntegrationTests.Attachments.TestHost;
using ClinicHub.IntegrationTests.Harness.Assertions;
using Shouldly;

namespace ClinicHub.IntegrationTests.Attachments;

/// <summary>The body limits, which only a real server enforces (docs/design/attachments.md § 5, § 8): the app behind real Kestrel.</summary>
[Collection(AttachmentsCollection2.Name)]
[Trait("Area", "attachments")]
public class AttachmentKestrelTests(AttachmentsAppFixture app) : AttachmentTest(app)
{
    private const int MegaByte = (int)AttachmentSettings.BytesPerMb;

    [Fact]
    [Trait("Case", "ATT-082")]
    public async Task A_chunked_body_going_past_the_limit_answers_attachmentTooLarge()
    {
        var clinic = await Data.Clinic();
        await using var host = await RealKestrelHost.StartAsync(Host);
        var owner = await Login.On(host.Variant).OwnerAsync(clinic);
        var disk = new AttachmentDisk(host.Variant.AttachmentRoot);
        var head = MultipartBody.Utf8(MultipartBody.FilePart("too-big.png"));

        // M's limit is 10 MB: well past it plus the filter's 64 KB for the framing, with no Content-Length to refuse it by
        var response = await host.SendChunkedAsync(Url(ClinicRoute, M, NewRef()), owner.AccessToken, MultipartBody.ContentType, head, 12L * MegaByte);

        await response.ShouldBeProblemAsync(HttpStatusCode.BadRequest, "attachmentTooLarge");
        (await RowsOfClinicAsync(clinic.Id)).ShouldBeEmpty();
        disk.OfClinic(clinic.Id).ShouldBeEmpty();
    }

    [Fact]
    [Trait("Case", "ATT-095")]
    public async Task A_31_MB_file_within_a_raised_limit_is_accepted_past_the_servers_default_limit()
    {
        var clinic = await Data.Clinic();
        await using var host = await RealKestrelHost.StartAsync(Host, new Dictionary<string, string>
        {
            ["Attachments:MaxFileSizeMb"] = "40",
            ["Attachments:Modules:clinicPaper:MaxFileSizeMb"] = "40",
        });
        var owner = await Login.On(host.Variant).OwnerAsync(clinic);
        using var client = host.CreateClient(owner.AccessToken);
        var bytes = FileSamples.Png(31 * MegaByte);

        var response = await client.PostAsync(Url(ClinicRoute, M, NewRef()), MultipartBody.Of("large.png", bytes));

        var file = await response.ShouldBeStoredAsync();
        file.SizeBytes.ShouldBe(31 * MegaByte);
        var row = await RowAsync(file.Id);
        new AttachmentDisk(host.Variant.AttachmentRoot).Read(row.StorageKey).ShouldBeTheBytes(bytes);
    }
}
