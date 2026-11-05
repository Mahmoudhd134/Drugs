using System.Net;
using ClinicHub.Infrastructure.Database;
using ClinicHub.IntegrationTests.Attachments.TestHost;
using ClinicHub.IntegrationTests.Harness.Assertions;
using Microsoft.Extensions.Logging;
using Shouldly;

namespace ClinicHub.IntegrationTests.Attachments;

/// <summary>
/// The cleanup (docs/design/attachments.md § 6): it removes a file only when no row has its ID, whenever the outermost transaction ends.
/// Each case has a seam or a command of the test host: a failing save, a failing lookup, a save that commits and then throws.
/// </summary>
[Collection(AttachmentsCollection2.Name)]
[Trait("Area", "attachments")]
public class AttachmentFailureTests(AttachmentsAppFixture app) : AttachmentTest(app)
{
    private const string AttachmentServiceCategory = "ClinicHub.Application.Features.Attachments.Files.AttachmentService";

    [Fact]
    [Trait("Case", "ATT-120")]
    public async Task A_command_that_adds_a_file_then_fails_leaves_no_row_and_no_file()
    {
        var (clinic, owner) = await ClinicWithOwnerAsync();
        var before = Disk.OfClinic(clinic.Id);

        var response = await owner.UploadAsync(AttachmentTestRoutes.Scenario(AddThen.Fail, NewRef()), "a.png", FileSamples.Png());

        await response.ShouldBeProblemAsync(HttpStatusCode.Conflict, "conflict");
        var added = Seams.AddedByCommands.ShouldHaveSingleItem();
        added.FileWasOnDisk.ShouldBeTrue("the file was written before the command failed");
        (await RowOrNullAsync(added.Id)).ShouldBeNull();
        Disk.Has(added.Key).ShouldBeFalse();
        Disk.OfClinic(clinic.Id).ShouldBe(before);
    }

    [Fact]
    [Trait("Case", "ATT-121")]
    public async Task A_command_that_adds_a_file_then_throws_leaves_no_row_and_no_file()
    {
        var (clinic, owner) = await ClinicWithOwnerAsync();
        var before = Disk.OfClinic(clinic.Id);

        var response = await owner.UploadAsync(AttachmentTestRoutes.Scenario(AddThen.Throw, NewRef()), "a.png", FileSamples.Png());

        await response.ShouldBeProblemAsync(HttpStatusCode.InternalServerError, "unexpected");
        var added = Seams.AddedByCommands.ShouldHaveSingleItem();
        added.FileWasOnDisk.ShouldBeTrue("the file was written before the command threw");
        (await RowOrNullAsync(added.Id)).ShouldBeNull();
        Disk.Has(added.Key).ShouldBeFalse();
        Disk.OfClinic(clinic.Id).ShouldBe(before);
    }

    [Fact]
    [Trait("Case", "ATT-122")]
    public async Task When_the_rows_save_throws_the_file_is_removed_and_the_exception_goes_on()
    {
        var (clinic, owner) = await ClinicWithOwnerAsync();
        var before = Disk.OfClinic(clinic.Id);
        Seams.FailAttachmentSave = true;

        var response = await owner.UploadAsync(Url(ClinicRoute, G, NewRef()), "a.png", FileSamples.Png());

        await response.ShouldBeProblemAsync(HttpStatusCode.InternalServerError, "unexpected");
        var attempted = Seams.BeingSaved.ShouldHaveSingleItem();
        attempted.FileWasOnDisk.ShouldBeTrue("the file is written before the save");
        (await RowOrNullAsync(attempted.Id)).ShouldBeNull();
        Disk.OfClinic(clinic.Id).ShouldBe(before);
    }

    [Fact]
    [Trait("Case", "ATT-123")]
    public async Task A_file_committed_inside_a_Use_block_that_ended_before_the_cleanup_is_kept()
    {
        var (clinic, staff) = await ClinicWithOwnerAsync();
        var admin = await Login.SuperAdminAsync();
        var refId = NewRef();
        var bytes = FileSamples.Png();

        var file = await (await admin.UploadAsync(AttachmentTestRoutes.UseBlock(clinic.Id, refId), "a.png", bytes)).ShouldBeStoredAsync();

        var row = await RowAsync(file.Id);
        row.ClinicId.ShouldBe(clinic.Id);
        row.StorageKey.ShouldBe($"clinics/{clinic.Id}/{file.Id:D}");
        Disk.Read(row.StorageKey).ShouldBeTheBytes(bytes);
        Seams.Removed.ShouldBeEmpty();
        (await staff.DownloadedAsync(Url(ClinicRoute, G, refId, file.Id))).ShouldBeTheBytes(bytes);
    }

    [Fact]
    [Trait("Case", "ATT-124")]
    public async Task A_platform_upload_that_commits_keeps_its_file()
    {
        var admin = await Login.SuperAdminAsync();
        var refId = NewRef();
        var bytes = FileSamples.Png();

        var file = await admin.StoredAsync(Url(Inside, G, refId), "a.png", bytes);

        var row = await RowAsync(file.Id);
        Disk.Read(row.StorageKey).ShouldBeTheBytes(bytes);
        Seams.Removed.ShouldBeEmpty();
        (await admin.DownloadedAsync(Url(PlatformRoute, G, refId, file.Id))).ShouldBeTheBytes(bytes);
    }

    [Fact]
    [Trait("Case", "ATT-125")]
    public async Task When_the_cleanups_lookup_fails_it_logs_and_the_file_stays()
    {
        var (_, owner) = await ClinicWithOwnerAsync();

        var response = await owner.UploadAsync(AttachmentTestRoutes.Scenario(AddThen.ThrowWithLookupsDown, NewRef()), "a.png", FileSamples.Png());

        await response.ShouldBeProblemAsync(HttpStatusCode.InternalServerError, "unexpected");
        Seams.FailAttachmentLookups = false;
        var added = Seams.AddedByCommands.ShouldHaveSingleItem();
        (await RowOrNullAsync(added.Id)).ShouldBeNull();
        Disk.Has(added.Key).ShouldBeTrue("the safe side: a lookup that failed removes nothing");
        Seams.Removed.ShouldBeEmpty();
        Logs.Of<TransactionRunner>(LogLevel.Error).ShouldNotBeEmpty();
    }

    [Fact]
    [Trait("Case", "ATT-126")]
    public async Task A_nested_commands_rolled_back_file_is_removed_and_the_outer_commands_is_kept()
    {
        var (clinic, owner) = await ClinicWithOwnerAsync();
        var refId = NewRef();
        var bytes = FileSamples.Png();

        var outer = await (await owner.UploadAsync(AttachmentTestRoutes.Nested(refId), "a.png", bytes)).ShouldBeStoredAsync();

        var added = Seams.AddedByCommands.ToList();
        added.Count.ShouldBe(2);
        added[0].Id.ShouldBe(outer.Id);
        var nested = added[1];
        nested.FileWasOnDisk.ShouldBeTrue("the nested file was written before its command failed");
        (await RowOrNullAsync(nested.Id)).ShouldBeNull();
        Disk.Has(nested.Key).ShouldBeFalse();
        (await RowAsync(outer.Id)).DeletedAt.ShouldBeNull();
        Disk.Read(added[0].Key).ShouldBeTheBytes(bytes);
        (await RowsOfClinicAsync(clinic.Id)).Select(r => r.Id).ShouldBe([outer.Id]);
        (await owner.DownloadedAsync(Url(ClinicRoute, G, refId, outer.Id))).ShouldBeTheBytes(bytes);
    }

    [Fact]
    [Trait("Case", "ATT-127")]
    public async Task A_row_whose_file_is_missing_opens_as_404_and_an_error_is_logged()
    {
        var (_, owner) = await ClinicWithOwnerAsync();
        var refId = NewRef();
        var file = await owner.StoredAsync(Url(ClinicRoute, G, refId), "secret-name.png", FileSamples.Png());
        File.Delete(Disk.PathOf((await RowAsync(file.Id)).StorageKey));
        Logs.Clear();

        await ShouldBeNotFoundAsync(owner.GetAsync(Url(ClinicRoute, G, refId, file.Id)));

        var error = Logs.All.Where(e => e.Category == AttachmentServiceCategory && e.Level == LogLevel.Error).ShouldHaveSingleItem();
        error.Message.ShouldContain(file.Id.ToString());
        error.Message.ShouldNotContain("secret-name");
    }

    [Fact]
    [Trait("Case", "ATT-128")]
    public async Task A_disk_write_that_fails_answers_500_unexpected_and_writes_no_row()
    {
        var (clinic, owner) = await ClinicWithOwnerAsync();
        var before = Disk.OfClinic(clinic.Id);
        Seams.FailFileWrites = true;

        var response = await owner.UploadAsync(Url(ClinicRoute, G, NewRef()), "a.png", FileSamples.Png());

        await response.ShouldBeProblemAsync(HttpStatusCode.InternalServerError, "unexpected");
        (await RowsOfClinicAsync(clinic.Id)).ShouldBeEmpty();
        Disk.OfClinic(clinic.Id).ShouldBe(before);
    }

    [Fact]
    [Trait("Case", "ATT-131")]
    public async Task The_service_called_with_no_transaction_keeps_the_committed_file()
    {
        var (_, owner) = await ClinicWithOwnerAsync();
        var refId = NewRef();
        var bytes = FileSamples.Png();

        var file = await (await owner.UploadAsync(AttachmentTestRoutes.Direct(refId), "a.png", bytes)).ShouldBeStoredAsync();

        var row = await RowAsync(file.Id);
        Disk.Read(row.StorageKey).ShouldBeTheBytes(bytes);
        Seams.Removed.ShouldBeEmpty();
        (await owner.DownloadedAsync(Url(ClinicRoute, G, refId, file.Id))).ShouldBeTheBytes(bytes);
    }

    [Fact]
    [Trait("Case", "ATT-132")]
    public async Task A_save_that_committed_then_lost_its_connection_finds_the_row_and_the_file_stays()
    {
        var (clinic, owner) = await ClinicWithOwnerAsync();
        var refId = NewRef();
        var bytes = FileSamples.Png();
        Seams.ThrowAfterAttachmentSave = true;

        var response = await owner.UploadAsync(AttachmentTestRoutes.Direct(refId), "a.png", bytes);

        await response.ShouldBeProblemAsync(HttpStatusCode.InternalServerError, "unexpected");
        Seams.ThrowAfterAttachmentSave = false;
        var row = (await RowsOfClinicAsync(clinic.Id)).ShouldHaveSingleItem();
        Disk.Read(row.StorageKey).ShouldBeTheBytes(bytes);
        Seams.Removed.ShouldBeEmpty();
        (await owner.DownloadedAsync(Url(ClinicRoute, G, refId, row.Id))).ShouldBeTheBytes(bytes);
    }

    [Fact]
    [Trait("Case", "ATT-134")]
    public async Task A_cancel_during_the_rows_save_still_removes_the_file()
    {
        var (clinic, owner) = await ClinicWithOwnerAsync();
        var before = Disk.OfClinic(clinic.Id);

        var response = await owner.UploadAsync(AttachmentTestRoutes.Scenario(AddThen.CancelDuringSave, NewRef()), "a.png", FileSamples.Png());

        // The token the service got is cancelled, the request isn't, so the API answers as for any exception left
        await response.ShouldBeProblemAsync(HttpStatusCode.InternalServerError, "unexpected");
        var attempted = Seams.BeingSaved.ShouldHaveSingleItem();
        attempted.FileWasOnDisk.ShouldBeTrue("the file is written before the save");
        (await RowOrNullAsync(attempted.Id)).ShouldBeNull();
        Disk.Has(attempted.Key).ShouldBeFalse();
        Disk.OfClinic(clinic.Id).ShouldBe(before);
    }
}
