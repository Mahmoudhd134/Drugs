using System.Net;
using System.Net.Http.Headers;
using ClinicHub.IntegrationTests.Attachments.TestHost;
using ClinicHub.IntegrationTests.Harness.Assertions;
using Microsoft.EntityFrameworkCore;
using Shouldly;

namespace ClinicHub.IntegrationTests.Attachments;

/// <summary>Delete and replace only mark the row: no file is ever hard deleted (docs/design/attachments.md A8, § 6).</summary>
[Collection(AttachmentsCollection2.Name)]
[Trait("Area", "attachments")]
public class AttachmentDeleteReplaceTests(AttachmentsAppFixture app) : AttachmentTest(app)
{
    [Fact]
    [Trait("Case", "ATT-100")]
    [Trait("Tier", "Smoke")]
    public async Task A_deleted_file_leaves_the_list_opens_as_404_and_stays_on_disk_with_the_row_marked()
    {
        var (clinic, owner) = await ClinicWithOwnerAsync();
        var refId = NewRef();
        var bytes = FileSamples.Png();
        var file = await owner.StoredAsync(Url(ClinicRoute, G, refId), "a.png", bytes);
        Clock.Advance(TimeSpan.FromMinutes(1));

        await (await owner.DeleteAsync(Url(ClinicRoute, G, refId, file.Id))).ShouldBeAsync(HttpStatusCode.NoContent);

        (await owner.ListedAsync(Url(ClinicRoute, G, refId))).ShouldBeEmpty();
        await ShouldBeNotFoundAsync(owner.GetAsync(Url(ClinicRoute, G, refId, file.Id)));
        var row = await RowAsync(file.Id);
        row.DeletedAt.ShouldBe(Clock.GetUtcNow().UtcDateTime);
        row.DeletedByUserId.ShouldBe(clinic.Owner.UserId);
        Disk.Read(row.StorageKey).ShouldBeTheBytes(bytes);
        Seams.Removed.ShouldBeEmpty();
    }

    [Fact]
    [Trait("Case", "ATT-101")]
    [Trait("Tier", "Smoke")]
    public async Task A_replaced_file_has_a_new_id_the_old_id_is_404_and_the_old_file_stays_on_disk()
    {
        var (clinic, owner) = await ClinicWithOwnerAsync();
        var refId = NewRef();
        var oldBytes = FileSamples.Png();
        var newBytes = FileSamples.Png();
        var old = await owner.StoredAsync(Url(ClinicRoute, G, refId), "old.png", oldBytes);

        var replacement = await (await owner.ReplaceAsync(Url(ClinicRoute, G, refId, old.Id), "new.png", newBytes)).ShouldBeStoredAsync();

        replacement.Id.ShouldNotBe(old.Id);
        replacement.OriginalFileName.ShouldBe("new.png");
        await ShouldBeNotFoundAsync(owner.GetAsync(Url(ClinicRoute, G, refId, old.Id)));
        (await owner.ListedAsync(Url(ClinicRoute, G, refId))).Select(f => f.Id).ShouldBe([replacement.Id]);
        (await owner.DownloadedAsync(Url(ClinicRoute, G, refId, replacement.Id))).ShouldBeTheBytes(newBytes);
        var oldRow = await RowAsync(old.Id);
        oldRow.DeletedAt.ShouldBe(Clock.GetUtcNow().UtcDateTime);
        oldRow.DeletedByUserId.ShouldBe(clinic.Owner.UserId);
        Disk.Read(oldRow.StorageKey).ShouldBeTheBytes(oldBytes);
        Disk.Read((await RowAsync(replacement.Id)).StorageKey).ShouldBeTheBytes(newBytes);
        Seams.Removed.ShouldBeEmpty();
    }

    [Fact]
    [Trait("Case", "ATT-102")]
    public async Task A_replace_with_a_refused_file_keeps_the_old_one_and_writes_nothing()
    {
        var (clinic, owner) = await ClinicWithOwnerAsync();
        var refId = NewRef();
        var bytes = FileSamples.Png();
        var file = await owner.StoredAsync(Url(ClinicRoute, G, refId), "a.png", bytes);
        var rowBefore = await RowBeforeAsync(file.Id);
        var before = Disk.OfClinic(clinic.Id);

        await (await owner.ReplaceAsync(Url(ClinicRoute, G, refId, file.Id), "setup.exe", FileSamples.Exe()))
            .ShouldBeProblemAsync(HttpStatusCode.BadRequest, "attachmentTypeNotAllowed");

        ShouldBeLive(await RowAsync(file.Id), rowBefore);
        (await RowsOfClinicAsync(clinic.Id)).Count.ShouldBe(1);
        Disk.OfClinic(clinic.Id).ShouldBe(before);
        (await owner.DownloadedAsync(Url(ClinicRoute, G, refId, file.Id))).ShouldBeTheBytes(bytes);
    }

    [Fact]
    [Trait("Case", "ATT-103")]
    public async Task A_deleted_file_deleted_or_replaced_again_is_404()
    {
        var (clinic, owner) = await ClinicWithOwnerAsync();
        var refId = NewRef();
        var file = await owner.StoredAsync(Url(ClinicRoute, G, refId), "a.png", FileSamples.Png());
        await (await owner.DeleteAsync(Url(ClinicRoute, G, refId, file.Id))).ShouldBeAsync(HttpStatusCode.NoContent);
        var before = Disk.OfClinic(clinic.Id);

        await ShouldBeNotFoundAsync(owner.DeleteAsync(Url(ClinicRoute, G, refId, file.Id)));
        await ShouldBeNotFoundAsync(owner.ReplaceAsync(Url(ClinicRoute, G, refId, file.Id), "b.png", FileSamples.Png()));
        // The old row is found before the new file's rules run: a refused file on a deleted row is still 404
        await ShouldBeNotFoundAsync(owner.ReplaceAsync(Url(ClinicRoute, G, refId, file.Id), "setup.exe", FileSamples.Exe()));

        (await RowsOfClinicAsync(clinic.Id)).Count.ShouldBe(1);
        Disk.OfClinic(clinic.Id).ShouldBe(before);
    }

    [Fact]
    [Trait("Case", "ATT-104")]
    public async Task Delete_all_marks_the_owners_files_only_and_all_stay_on_disk()
    {
        var (clinicA, a) = await ClinicWithOwnerAsync();
        var (_, b) = await ClinicWithOwnerAsync();
        var refId = NewRef();
        var ownFiles = new[]
        {
            await a.StoredAsync(Url(ClinicRoute, G, refId), "1.png", FileSamples.Png()),
            await a.StoredAsync(Url(ClinicRoute, G, refId), "2.png", FileSamples.Png()),
            await a.StoredAsync(Url(ClinicRoute, G, refId), "3.png", FileSamples.Png()),
        };
        var otherRef = await a.StoredAsync(Url(ClinicRoute, G, NewRef()), "other-ref.png", FileSamples.Png());
        var otherModule = await a.StoredAsync(Url(ClinicRoute, M, refId), "other-module.png", FileSamples.Png());
        var otherClinic = await b.StoredAsync(Url(ClinicRoute, G, refId), "other-clinic.png", FileSamples.Png());
        var before = Disk.OfClinic(clinicA.Id);
        Clock.Advance(TimeSpan.FromMinutes(1));

        await (await a.DeleteAsync(Url(ClinicRoute, G, refId))).ShouldBeAsync(HttpStatusCode.NoContent);

        foreach (var file in ownFiles)
        {
            var row = await RowAsync(file.Id);
            row.DeletedAt.ShouldBe(Clock.GetUtcNow().UtcDateTime);
            row.DeletedByUserId.ShouldBe(clinicA.Owner.UserId);
            // Loaded and marked, with no ExecuteUpdate: only the save interceptor stamps this
            row.UpdatedAt.ShouldBe(Clock.GetUtcNow().UtcDateTime);
        }
        (await RowAsync(otherRef.Id)).DeletedAt.ShouldBeNull();
        (await RowAsync(otherModule.Id)).DeletedAt.ShouldBeNull();
        (await RowAsync(otherClinic.Id)).DeletedAt.ShouldBeNull();
        (await a.ListedAsync(Url(ClinicRoute, G, refId))).ShouldBeEmpty();
        (await b.ListedAsync(Url(ClinicRoute, G, refId))).Select(f => f.Id).ShouldBe([otherClinic.Id]);
        Disk.OfClinic(clinicA.Id).ShouldBe(before);
        Seams.Removed.ShouldBeEmpty();
    }

    [Fact]
    [Trait("Case", "ATT-105")]
    public async Task A_soft_deleted_clinic_keeps_its_rows_and_files()
    {
        var (clinic, owner) = await ClinicWithOwnerAsync();
        var bytes = FileSamples.Png();
        var file = await owner.StoredAsync(Url(ClinicRoute, G, NewRef()), "a.png", bytes);
        var rowBefore = await RowBeforeAsync(file.Id);

        await Data.DeleteClinicAsync(clinic);

        ShouldBeLive(await RowAsync(file.Id), rowBefore);
        Disk.Read(rowBefore.StorageKey).ShouldBeTheBytes(bytes);
    }

    [Fact]
    [Trait("Case", "ATT-106")]
    public async Task A_new_clinic_from_a_template_holding_attachments_has_none()
    {
        var template = await Login.SuperAdminInTemplateAsync();
        var refId = NewRef();
        await template.StoredAsync(Url(ClinicRoute, G, refId), "template.png", FileSamples.Png());

        var (clinic, owner) = await ClinicWithOwnerAsync();

        (await RowsOfClinicAsync(clinic.Id)).ShouldBeEmpty();
        Disk.OfClinic(clinic.Id).ShouldBeEmpty();
        (await owner.ListedAsync(Url(ClinicRoute, G, refId))).ShouldBeEmpty();
    }

    [Fact]
    [Trait("Case", "ATT-108")]
    public async Task A_replace_whose_save_throws_keeps_the_old_row_live_and_removes_the_new_file()
    {
        var (clinic, owner) = await ClinicWithOwnerAsync();
        var refId = NewRef();
        var bytes = FileSamples.Png();
        var file = await owner.StoredAsync(Url(ClinicRoute, G, refId), "a.png", bytes);
        var rowBefore = await RowBeforeAsync(file.Id);
        var before = Disk.OfClinic(clinic.Id);
        Seams.BeingSaved.Clear();
        Seams.FailAttachmentSave = true;

        await (await owner.ReplaceAsync(Url(ClinicRoute, G, refId, file.Id), "b.png", FileSamples.Png()))
            .ShouldBeProblemAsync(HttpStatusCode.InternalServerError, "unexpected");

        Seams.FailAttachmentSave = false;
        var attempted = Seams.BeingSaved.ShouldHaveSingleItem();
        attempted.FileWasOnDisk.ShouldBeTrue("the new file is written before the save");
        Seams.Removed.ShouldContain(attempted.Key);
        ShouldBeLive(await RowAsync(file.Id), rowBefore);
        (await RowsOfClinicAsync(clinic.Id)).Count.ShouldBe(1);
        Disk.OfClinic(clinic.Id).ShouldBe(before);
        (await owner.DownloadedAsync(Url(ClinicRoute, G, refId, file.Id))).ShouldBeTheBytes(bytes);
    }

    [Fact]
    [Trait("Case", "ATT-108")]
    public async Task A_replace_with_no_transaction_whose_save_throws_keeps_the_old_row_live_and_removes_the_new_file()
    {
        var (clinic, owner) = await ClinicWithOwnerAsync();
        var refId = NewRef();
        var bytes = FileSamples.Png();
        var file = await owner.StoredAsync(Url(ClinicRoute, G, refId), "a.png", bytes);
        var rowBefore = await RowBeforeAsync(file.Id);
        var before = Disk.OfClinic(clinic.Id);
        Seams.BeingSaved.Clear();
        Seams.FailAttachmentSave = true;

        await (await owner.ReplaceAsync(AttachmentTestRoutes.Direct(refId, file.Id), "b.png", FileSamples.Png()))
            .ShouldBeProblemAsync(HttpStatusCode.InternalServerError, "unexpected");

        Seams.FailAttachmentSave = false;
        var attempted = Seams.BeingSaved.ShouldHaveSingleItem();
        attempted.FileWasOnDisk.ShouldBeTrue("the new file is written before the save");
        Seams.Removed.ShouldContain(attempted.Key);
        // No transaction rolls anything back: the mark can only stay unsaved if it went in the save that failed
        ShouldBeLive(await RowAsync(file.Id), rowBefore);
        (await RowsOfClinicAsync(clinic.Id)).Count.ShouldBe(1);
        Disk.OfClinic(clinic.Id).ShouldBe(before);
        (await owner.DownloadedAsync(Url(ClinicRoute, G, refId, file.Id))).ShouldBeTheBytes(bytes);
    }

    [Theory]
    [Trait("Case", "ATT-108")]
    [InlineData(true)]
    [InlineData(false)]
    public async Task A_replace_adds_the_new_row_and_marks_the_old_one_in_one_save(bool inACommand)
    {
        var (_, owner) = await ClinicWithOwnerAsync();
        var refId = NewRef();
        var file = await owner.StoredAsync(Url(ClinicRoute, G, refId), "a.png", FileSamples.Png());
        Seams.Saves.Clear();
        var url = inACommand ? Url(ClinicRoute, G, refId, file.Id) : AttachmentTestRoutes.Direct(refId, file.Id);

        await (await owner.ReplaceAsync(url, "b.png", FileSamples.Png())).ShouldBeStoredAsync();

        Seams.Saves.ShouldHaveSingleItem().ShouldBe(new AttachmentSave(Added: 1, Changed: 1));
    }

    [Fact]
    [Trait("Case", "ATT-111")]
    public async Task A_download_in_flight_gets_all_its_bytes_when_the_file_is_deleted_and_the_next_open_is_404()
    {
        var (_, owner) = await ClinicWithOwnerAsync();
        var refId = NewRef();
        var bytes = FileSamples.Png(512 * 1024);
        var file = await owner.StoredAsync(Url(ClinicRoute, G, refId), "a.png", bytes);
        var request = new HttpRequestMessage(HttpMethod.Get, Url(ClinicRoute, G, refId, file.Id));
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", owner.AccessToken);

        using var download = await owner.Http.SendAsync(request, HttpCompletionOption.ResponseHeadersRead);
        download.StatusCode.ShouldBe(HttpStatusCode.OK);
        await using var body = await download.Content.ReadAsStreamAsync();
        var received = new byte[bytes.Length];
        var first = await body.ReadAtLeastAsync(received.AsMemory(0, 1024), 1024);

        await (await owner.DeleteAsync(Url(ClinicRoute, G, refId, file.Id))).ShouldBeAsync(HttpStatusCode.NoContent);

        await body.ReadExactlyAsync(received.AsMemory(first));
        received.ShouldBeTheBytes(bytes);
        await ShouldBeNotFoundAsync(owner.GetAsync(Url(ClinicRoute, G, refId, file.Id)));
    }
}
