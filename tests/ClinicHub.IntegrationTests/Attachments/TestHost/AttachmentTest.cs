using System.Net;
using ClinicHub.Domain.Attachments;
using ClinicHub.IntegrationTests.Harness.Assertions;
using ClinicHub.IntegrationTests.Harness.Builders;
using ClinicHub.IntegrationTests.Harness.Clients;
using ClinicHub.IntegrationTests.Harness.Hosting;
using Microsoft.EntityFrameworkCore;
using Shouldly;

namespace ClinicHub.IntegrationTests.Attachments.TestHost;

/// <summary>Base of the attachment tests: the seams are off and the logs empty when a test starts.</summary>
public abstract class AttachmentTest(AttachmentsAppFixture app) : IntegrationTest(app)
{
    protected const string M = AttachmentTestRoutes.M;
    protected const string G = AttachmentTestRoutes.G;
    protected const string ClinicRoute = AttachmentTestRoutes.Clinic;
    protected const string PlatformRoute = AttachmentTestRoutes.Platform;
    protected const string Inside = AttachmentTestRoutes.PlatformInside;
    protected const string Outside = AttachmentTestRoutes.PlatformOutside;

    protected AttachmentsAppFixture Host { get; } = app;
    protected AttachmentDisk Disk => Host.Disk;
    protected AttachmentSeams Seams => Host.Seams;
    protected CapturedLogs Logs => Host.Logs;

    protected override Task SetUpAsync()
    {
        Seams.Reset();
        Logs.Clear();
        return Task.CompletedTask;
    }

    /// <summary>An owner's ref ID no other test uses.</summary>
    protected static string NewRef() => Guid.NewGuid().ToString("N");

    protected static string Url(string routeBase, string module, string refId) => AttachmentTestRoutes.Of(routeBase, module, refId);

    protected static string Url(string routeBase, string module, string refId, Guid id) => AttachmentTestRoutes.Of(routeBase, module, refId, id);

    /// <summary>A new clinic and its owner, logged in there (the owner holds every permission).</summary>
    protected async Task<(ClinicHandle Clinic, ApiClient Owner)> ClinicWithOwnerAsync()
    {
        var clinic = await Data.Clinic();
        return (clinic, await Login.OwnerAsync(clinic));
    }

    protected Task<Attachment> RowAsync(Guid id) =>
        Host.QueryDbAsync(db => db.Attachments.IgnoreQueryFilters().AsNoTracking().SingleAsync(a => a.Id == id));

    protected Task<Attachment> RowOrNullAsync(Guid id) =>
        Host.QueryDbAsync(db => db.Attachments.IgnoreQueryFilters().AsNoTracking().SingleOrDefaultAsync(a => a.Id == id));

    /// <summary>Every row of a clinic, deleted ones too.</summary>
    protected Task<List<Attachment>> RowsOfClinicAsync(int clinicId) =>
        Host.QueryDbAsync(db => db.Attachments.IgnoreQueryFilters().AsNoTracking().Where(a => a.ClinicId == clinicId).ToListAsync());

    /// <summary>Every platform row of an owner, deleted ones too.</summary>
    protected Task<List<Attachment>> PlatformRowsAsync(string refId) =>
        Host.QueryDbAsync(db => db.Attachments.IgnoreQueryFilters().AsNoTracking().Where(a => a.ClinicId == null && a.RefId == refId).ToListAsync());

    /// <summary>The call answered 404 <c>notFound</c>, as a file that doesn't exist.</summary>
    protected static async Task ShouldBeNotFoundAsync(Task<HttpResponseMessage> call) =>
        await (await call).ShouldBeProblemAsync(HttpStatusCode.NotFound, "notFound");

    /// <summary>A row is what it was: same owner, name, key and size, not marked deleted.</summary>
    protected static void ShouldBeLive(Attachment row, Attachment before)
    {
        row.DeletedAt.ShouldBeNull();
        row.DeletedByUserId.ShouldBeNull();
        row.ClinicId.ShouldBe(before.ClinicId);
        row.Module.ShouldBe(before.Module);
        row.RefId.ShouldBe(before.RefId);
        row.OriginalFileName.ShouldBe(before.OriginalFileName);
        row.StorageKey.ShouldBe(before.StorageKey);
        row.SizeBytes.ShouldBe(before.SizeBytes);
        row.UpdatedAt.ShouldBe(before.UpdatedAt);
    }
}
