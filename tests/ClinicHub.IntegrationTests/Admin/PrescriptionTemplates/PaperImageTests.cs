using System.Net;
using System.Text;
using ClinicHub.Application.Features.Attachments.Files;
using ClinicHub.Application.Features.Prescriptions.Templates;
using ClinicHub.IntegrationTests.Attachments.TestHost;
using ClinicHub.IntegrationTests.Harness.Assertions;
using ClinicHub.IntegrationTests.Harness.Builders;
using ClinicHub.IntegrationTests.Harness.Clients;
using ClinicHub.IntegrationTests.Harness.Hosting;
using Microsoft.EntityFrameworkCore;
using Shouldly;
using static ClinicHub.IntegrationTests.Admin.PrescriptionTemplates.LayoutBuilder;

namespace ClinicHub.IntegrationTests.Admin.PrescriptionTemplates;

/// <summary>
/// The paper image's six real routes (step 4 design § 4, A10, A12, P1, P2): what they accept, replace and remove. One picture per clinic: a POST lists first and
/// replaces the newest; a removed or replaced picture is only marked, its file stays.
/// </summary>
[Collection(AdminCollection7.Name)]
[Trait("Area", "admin")]
public class PaperImageTests(AppFixture app) : IntegrationTest(app)
{
    private AttachmentDisk Disk => new(App.Factory.AttachmentRoot);

    private async Task<(ApiClient Admin, ClinicHandle Clinic)> ClinicAsync() =>
        (await Login.SharedSuperAdminAsync(), await Data.Clinic());

    /// <summary>What a WebP file starts with (`RIFF`, then `WEBP` at byte 8), so only the module's list refuses it.</summary>
    private static byte[] Webp()
    {
        var bytes = FileSamples.Png();
        Array.Clear(bytes, 0, 12);
        "RIFF"u8.CopyTo(bytes);
        "WEBP"u8.CopyTo(bytes.AsSpan(8));
        return bytes;
    }

    private async Task ShouldBeOpenAsync(ApiClient admin, int clinicId, Guid id, byte[] bytes) =>
        (await admin.DownloadedAsync(PaperImageApi.Item(clinicId, id))).ShouldBeTheBytes(bytes);

    /// <summary>The clinic's rows, disk and list are exactly as they were; call it after what should have changed nothing.</summary>
    private async Task<Func<Task>> SnapshotAsync(ApiClient admin, int clinicId)
    {
        var rows = (await App.PaperRowsAsync(clinicId)).Select(r => (r.Id, r.DeletedAt)).OrderBy(r => r.Id).ToList();
        var disk = Disk.OfClinic(clinicId);
        var listed = (await admin.PaperImagesAsync(clinicId)).Select(f => f.Id).ToList();
        return async () =>
        {
            (await App.PaperRowsAsync(clinicId)).Select(r => (r.Id, r.DeletedAt)).OrderBy(r => r.Id).ToList().ShouldBe(rows);
            Disk.OfClinic(clinicId).ShouldBe(disk);
            (await admin.PaperImagesAsync(clinicId)).Select(f => f.Id).ShouldBe(listed);
        };
    }

    // ---- TPL-651: PNG and JPEG are accepted ----

    [Theory]
    [Trait("Case", "TPL-651")]
    [InlineData("paper.jpg")]
    [InlineData("paper.jpeg")]
    [InlineData("PAPER.JPG")]
    public async Task A_JPEG_is_accepted_and_listed(string name)
    {
        var (admin, clinic) = await ClinicAsync();
        var bytes = FileSamples.Jpeg();

        var file = await admin.UploadPaperAsync(clinic.Id, name, bytes);

        file.TypeKey.ShouldBe("jpeg");
        file.ContentType.ShouldBe("image/jpeg");
        file.OriginalFileName.ShouldBe(name);
        file.SizeBytes.ShouldBe(bytes.Length);
        (await admin.PaperImagesAsync(clinic.Id)).ShouldHaveSingleItem().Id.ShouldBe(file.Id);
        await ShouldBeOpenAsync(admin, clinic.Id, file.Id, bytes);
    }

    [Fact]
    [Trait("Case", "TPL-651")]
    [Trait("Tier", "Smoke")]
    public async Task A_PNG_is_accepted_and_stored_under_the_clinic_with_the_pictures_owner()
    {
        var (admin, clinic) = await ClinicAsync();
        var bytes = FileSamples.Png();

        var file = await admin.UploadPaperAsync(clinic.Id, "paper.png", bytes);

        file.TypeKey.ShouldBe("png");
        file.ContentType.ShouldBe("image/png");
        var row = (await App.PaperRowsAsync(clinic.Id)).ShouldHaveSingleItem();
        row.Id.ShouldBe(file.Id);
        row.ClinicId.ShouldBe(clinic.Id);
        row.Module.ShouldBe(AttachmentModules.ClinicPaper);
        row.RefId.ShouldBe(PaperImageApi.RefId);
        row.DeletedAt.ShouldBeNull();
        Disk.Read(row.StorageKey).ShouldBeTheBytes(bytes);
    }

    // ---- TPL-652: anything else is refused, and the old picture stays ----

    public static TheoryData<string, string> RefusedFiles => new()
    {
        { "paper.pdf", "pdf" },
        { "paper.webp", "webp" },
        { "paper.jpg", "png" },
        { "paper.png", "jpeg" },
        { "paper.png", "pdf" },
    };

    private static byte[] BytesOf(string kind) => kind switch
    {
        "pdf" => FileSamples.Pdf(),
        "webp" => Webp(),
        "png" => FileSamples.Png(),
        "jpeg" => FileSamples.Jpeg(),
        _ => throw new ArgumentOutOfRangeException(nameof(kind), kind, null),
    };

    [Theory]
    [MemberData(nameof(RefusedFiles))]
    [Trait("Case", "TPL-652")]
    public async Task Another_type_is_refused_on_a_POST_and_nothing_is_written(string name, string kind)
    {
        var (admin, clinic) = await ClinicAsync();

        await (await admin.UploadAsync(PaperImageApi.Route(clinic.Id), name, BytesOf(kind))).ShouldBeProblemAsync(HttpStatusCode.BadRequest, "attachmentTypeNotAllowed");

        (await App.PaperRowsAsync(clinic.Id)).ShouldBeEmpty();
        Disk.OfClinic(clinic.Id).ShouldBeEmpty();
    }

    [Theory]
    [MemberData(nameof(RefusedFiles))]
    [Trait("Case", "TPL-652")]
    public async Task Another_type_is_refused_on_a_POST_and_a_PUT_and_the_old_picture_stays(string name, string kind)
    {
        var (admin, clinic) = await ClinicAsync();
        var bytes = FileSamples.Png();
        var old = await admin.UploadPaperAsync(clinic.Id, "old.png", bytes);
        var nothingChanged = await SnapshotAsync(admin, clinic.Id);

        await (await admin.UploadAsync(PaperImageApi.Route(clinic.Id), name, BytesOf(kind))).ShouldBeProblemAsync(HttpStatusCode.BadRequest, "attachmentTypeNotAllowed");
        await (await admin.ReplaceAsync(PaperImageApi.Item(clinic.Id, old.Id), name, BytesOf(kind))).ShouldBeProblemAsync(HttpStatusCode.BadRequest, "attachmentTypeNotAllowed");

        await nothingChanged();
        await ShouldBeOpenAsync(admin, clinic.Id, old.Id, bytes);
    }

    // ---- TPL-653: the limit ----

    [Fact]
    [Trait("Case", "TPL-653")]
    public async Task A_file_at_the_limit_is_accepted()
    {
        var (admin, clinic) = await ClinicAsync();

        var file = await admin.UploadPaperAsync(clinic.Id, "at-the-limit.png", FileSamples.Png(PaperImageApi.LimitBytes));

        file.SizeBytes.ShouldBe(PaperImageApi.LimitBytes);
    }

    [Fact]
    [Trait("Case", "TPL-653")]
    public async Task One_byte_over_the_limit_is_attachmentTooLarge_and_nothing_is_written()
    {
        var (admin, clinic) = await ClinicAsync();

        await (await admin.UploadAsync(PaperImageApi.Route(clinic.Id), "over.png", FileSamples.Png(PaperImageApi.LimitBytes + 1)))
            .ShouldBeProblemAsync(HttpStatusCode.BadRequest, "attachmentTooLarge");

        (await App.PaperRowsAsync(clinic.Id)).ShouldBeEmpty();
        Disk.OfClinic(clinic.Id).ShouldBeEmpty();
    }

    [Fact]
    [Trait("Case", "TPL-653")]
    public async Task One_byte_over_the_limit_replacing_a_picture_keeps_it()
    {
        var (admin, clinic) = await ClinicAsync();
        var old = await admin.UploadPaperAsync(clinic.Id);
        var nothingChanged = await SnapshotAsync(admin, clinic.Id);

        await (await admin.ReplaceAsync(PaperImageApi.Item(clinic.Id, old.Id), "over.png", FileSamples.Png(PaperImageApi.LimitBytes + 1)))
            .ShouldBeProblemAsync(HttpStatusCode.BadRequest, "attachmentTooLarge");

        await nothingChanged();
    }

    // ---- TPL-654: replacing ----

    private async Task ShouldBeReplacedAsync(ApiClient admin, int clinicId, AttachmentDto old, byte[] oldBytes, AttachmentDto fresh, byte[] freshBytes)
    {
        fresh.Id.ShouldNotBe(old.Id);
        (await admin.PaperImagesAsync(clinicId)).ShouldHaveSingleItem().Id.ShouldBe(fresh.Id);

        var rows = await App.PaperRowsAsync(clinicId);
        rows.Count.ShouldBe(2);
        var oldRow = rows.Single(r => r.Id == old.Id);
        oldRow.DeletedAt.ShouldNotBeNull();
        oldRow.DeletedByUserId.ShouldNotBeNull();
        rows.Single(r => r.Id == fresh.Id).DeletedAt.ShouldBeNull();

        Disk.Read(oldRow.StorageKey).ShouldBeTheBytes(oldBytes);
        await ShouldBeOpenAsync(admin, clinicId, fresh.Id, freshBytes);
        await (await admin.GetAsync(PaperImageApi.Item(clinicId, old.Id))).ShouldBeProblemAsync(HttpStatusCode.NotFound, "notFound");
    }

    [Fact]
    [Trait("Case", "TPL-654")]
    [Trait("Tier", "Smoke")]
    public async Task A_POST_while_a_picture_exists_replaces_it()
    {
        var (admin, clinic) = await ClinicAsync();
        var (oldBytes, freshBytes) = (FileSamples.Png(), FileSamples.Jpeg());
        var old = await admin.UploadPaperAsync(clinic.Id, "old.png", oldBytes);
        Clock.Advance(TimeSpan.FromSeconds(1));

        var fresh = await admin.UploadPaperAsync(clinic.Id, "new.jpg", freshBytes);

        await ShouldBeReplacedAsync(admin, clinic.Id, old, oldBytes, fresh, freshBytes);
    }

    [Fact]
    [Trait("Case", "TPL-654")]
    public async Task A_PUT_on_its_id_replaces_it()
    {
        var (admin, clinic) = await ClinicAsync();
        var (oldBytes, freshBytes) = (FileSamples.Png(), FileSamples.Png());
        var old = await admin.UploadPaperAsync(clinic.Id, "old.png", oldBytes);
        Clock.Advance(TimeSpan.FromSeconds(1));

        var fresh = await (await admin.ReplaceAsync(PaperImageApi.Item(clinic.Id, old.Id), "new.png", freshBytes)).ShouldBeStoredAsync();

        fresh.OriginalFileName.ShouldBe("new.png");
        await ShouldBeReplacedAsync(admin, clinic.Id, old, oldBytes, fresh, freshBytes);
    }

    [Fact]
    [Trait("Case", "TPL-654")]
    public async Task Each_POST_after_the_first_keeps_one_live_row()
    {
        var (admin, clinic) = await ClinicAsync();
        AttachmentDto last = null;
        for (var n = 0; n < 3; n++)
        {
            last = await admin.UploadPaperAsync(clinic.Id, $"paper{n}.png");
            Clock.Advance(TimeSpan.FromSeconds(1));
        }

        (await admin.PaperImagesAsync(clinic.Id)).ShouldHaveSingleItem().Id.ShouldBe(last.Id);
        var rows = await App.PaperRowsAsync(clinic.Id);
        rows.Count.ShouldBe(3);
        rows.Count(r => r.DeletedAt is null).ShouldBe(1);
    }

    [Fact]
    [Trait("Case", "TPL-654")]
    public async Task A_PUT_on_a_missing_id_is_404_and_adds_nothing()
    {
        var (admin, clinic) = await ClinicAsync();

        await (await admin.ReplaceAsync(PaperImageApi.Item(clinic.Id, Guid.NewGuid()), "new.png", FileSamples.Png()))
            .ShouldBeProblemAsync(HttpStatusCode.NotFound, "notFound");

        (await App.PaperRowsAsync(clinic.Id)).ShouldBeEmpty();
        Disk.OfClinic(clinic.Id).ShouldBeEmpty();
    }

    // ---- TPL-655: removing ----

    [Fact]
    [Trait("Case", "TPL-655")]
    [Trait("Tier", "Smoke")]
    public async Task Removing_the_picture_answers_204_marks_the_row_and_the_file_stays()
    {
        var (admin, clinic) = await ClinicAsync();
        var bytes = FileSamples.Png();
        var file = await admin.UploadPaperAsync(clinic.Id, "paper.png", bytes);
        Clock.Advance(TimeSpan.FromSeconds(1));

        var body = await (await admin.DeleteAsync(PaperImageApi.Item(clinic.Id, file.Id))).ShouldBeAsync(HttpStatusCode.NoContent);

        body.ShouldBeEmpty();
        (await admin.PaperImagesAsync(clinic.Id)).ShouldBeEmpty();
        var row = (await App.PaperRowsAsync(clinic.Id)).ShouldHaveSingleItem();
        row.DeletedAt.ShouldBe(Clock.GetUtcNow().UtcDateTime);
        row.DeletedByUserId.ShouldNotBeNull();
        Disk.Read(row.StorageKey).ShouldBeTheBytes(bytes);
    }

    [Fact]
    [Trait("Case", "TPL-655")]
    public async Task A_removed_picture_answers_404_to_a_second_delete_a_read_and_a_replace()
    {
        var (admin, clinic) = await ClinicAsync();
        var file = await admin.UploadPaperAsync(clinic.Id);
        var url = PaperImageApi.Item(clinic.Id, file.Id);
        await (await admin.DeleteAsync(url)).ShouldBeAsync(HttpStatusCode.NoContent);
        var nothingChanged = await SnapshotAsync(admin, clinic.Id);

        await (await admin.DeleteAsync(url)).ShouldBeProblemAsync(HttpStatusCode.NotFound, "notFound");
        await (await admin.GetAsync(url)).ShouldBeProblemAsync(HttpStatusCode.NotFound, "notFound");
        await (await admin.ReplaceAsync(url, "new.png", FileSamples.Png())).ShouldBeProblemAsync(HttpStatusCode.NotFound, "notFound");

        await nothingChanged();
    }

    [Fact]
    [Trait("Case", "TPL-655")]
    public async Task After_a_removal_a_POST_adds_a_new_picture()
    {
        var (admin, clinic) = await ClinicAsync();
        var first = await admin.UploadPaperAsync(clinic.Id);
        await (await admin.DeleteAsync(PaperImageApi.Item(clinic.Id, first.Id))).ShouldBeAsync(HttpStatusCode.NoContent);

        var second = await admin.UploadPaperAsync(clinic.Id);

        second.Id.ShouldNotBe(first.Id);
        (await admin.PaperImagesAsync(clinic.Id)).ShouldHaveSingleItem().Id.ShouldBe(second.Id);
    }

    // ---- TPL-672: the template's own delete ----

    [Fact]
    [Trait("Case", "TPL-672")]
    public async Task Deleting_the_template_keeps_the_picture_and_it_is_there_for_a_new_template()
    {
        var (admin, clinic) = await ClinicAsync();
        await admin.SaveTemplateAsync(clinic.Id, L().WithCalibration(2, -1.5m));
        var bytes = FileSamples.Png();
        var file = await admin.UploadPaperAsync(clinic.Id, "paper.png", bytes);
        var nothingChanged = await SnapshotAsync(admin, clinic.Id);

        await (await admin.DeleteAsync(Route(clinic.Id))).ShouldBeAsync(HttpStatusCode.NoContent);

        await admin.ShouldHaveNoTemplateAsync(clinic.Id);
        await nothingChanged();
        await ShouldBeOpenAsync(admin, clinic.Id, file.Id, bytes);

        await admin.SaveTemplateAsync(clinic.Id, L());
        await nothingChanged();
    }

    [Fact]
    [Trait("Case", "TPL-672")]
    public async Task A_picture_needs_no_template_row()
    {
        var (admin, clinic) = await ClinicAsync();

        var file = await admin.UploadPaperAsync(clinic.Id);

        await admin.ShouldHaveNoTemplateAsync(clinic.Id);
        (await admin.PaperImagesAsync(clinic.Id)).ShouldHaveSingleItem().Id.ShouldBe(file.Id);
    }

    // ---- TPL-673: a new clinic ----

    [Fact]
    [Trait("Case", "TPL-673")]
    public async Task A_new_clinic_has_no_picture_though_the_template_clinic_and_another_clinic_do()
    {
        var admin = await Login.SharedSuperAdminAsync();
        var other = await Data.Clinic();
        await admin.UploadPaperAsync(other.Id);
        var template = await App.TemplateClinicIdAsync();
        var userId = await App.QueryDbAsync(db => db.Attachments.IgnoreQueryFilters().Where(a => a.ClinicId == other.Id).Select(a => a.CreatedByUserId).FirstAsync());
        var id = Guid.NewGuid();
        // The template clinic has no picture route (404), so this row can only be written by hand; its file doesn't matter: a copy would be the row
        await App.OutsideTheApp.ExecuteAsync(
            """
            INSERT INTO "Attachments" ("Id", "ClinicId", "Module", "RefId", "OriginalFileName", "TypeKey", "SizeBytes", "StorageKey", "CreatedByUserId", "CreatedAt", "UpdatedAt")
            VALUES (@p0, @p1, @p2, @p3, 'paper.png', 'png', 256, @p4, @p5, @p6, @p6)
            """,
            id, template, AttachmentModules.ClinicPaper, PaperImageApi.RefId, $"clinics/{template}/{id:D}", userId, Clock.GetUtcNow().UtcDateTime);
        (await App.PaperRowsAsync(template)).ShouldHaveSingleItem();

        var created = await Data.Clinic();

        (await admin.PaperImagesAsync(created.Id)).ShouldBeEmpty();
        (await App.PaperRowsAsync(created.Id)).ShouldBeEmpty();
        Disk.OfClinic(created.Id).ShouldBeEmpty();
    }

    // ---- TPL-676: two live rows from a race ----

    [Fact]
    [Trait("Case", "TPL-676")]
    public async Task Two_live_rows_are_answered_newest_first_and_removing_the_newest_brings_the_older_back()
    {
        var (admin, clinic) = await ClinicAsync();
        var (older, newer) = await TwoLiveRowsAsync(admin, clinic.Id);

        (await admin.PaperImagesAsync(clinic.Id)).Select(f => f.Id).ShouldBe([newer.Id, older.Id]);

        await (await admin.DeleteAsync(PaperImageApi.Item(clinic.Id, newer.Id))).ShouldBeAsync(HttpStatusCode.NoContent);

        (await admin.PaperImagesAsync(clinic.Id)).ShouldHaveSingleItem().Id.ShouldBe(older.Id);
    }

    [Fact]
    [Trait("Case", "TPL-676")]
    public async Task A_POST_with_two_live_rows_replaces_the_newest_and_the_older_stays_live()
    {
        var (admin, clinic) = await ClinicAsync();
        var (older, newer) = await TwoLiveRowsAsync(admin, clinic.Id);
        Clock.Advance(TimeSpan.FromSeconds(1));

        var fresh = await admin.UploadPaperAsync(clinic.Id, "fresh.png");

        (await admin.PaperImagesAsync(clinic.Id)).Select(f => f.Id).ShouldBe([fresh.Id, older.Id]);
        var rows = await App.PaperRowsAsync(clinic.Id);
        rows.Single(r => r.Id == newer.Id).DeletedAt.ShouldNotBeNull("the newest was the one replaced");
        rows.Single(r => r.Id == older.Id).DeletedAt.ShouldBeNull();
    }

    /// <summary>What two uploads in one instant leave: the replace saw no picture, so the first row was never marked.</summary>
    private async Task<(AttachmentDto Older, AttachmentDto Newer)> TwoLiveRowsAsync(ApiClient admin, int clinicId)
    {
        var older = await admin.UploadPaperAsync(clinicId, "older.png");
        Clock.Advance(TimeSpan.FromSeconds(1));
        var newer = await admin.UploadPaperAsync(clinicId, "newer.png");
        await App.OutsideTheApp.ExecuteAsync("""UPDATE "Attachments" SET "DeletedAt" = NULL, "DeletedByUserId" = NULL WHERE "Id" = @p0""", older.Id);
        return (older, newer);
    }

    // ---- TPL-716: the real routes' rules, bytes and refusals ----

    [Fact]
    [Trait("Case", "TPL-716")]
    [Trait("Tier", "Smoke")]
    public async Task Rules_gives_the_configs_limit_and_types()
    {
        var (admin, clinic) = await ClinicAsync();

        var response = await admin.GetAsync(PaperImageApi.Rules(clinic.Id));

        await response.ShouldBeOkAsync();
        var rules = await response.ReadAsync<AttachmentRulesDto>();
        rules.MaxFileSizeBytes.ShouldBe(PaperImageApi.LimitBytes);
        rules.Extensions.ShouldBe([".png", ".jpg", ".jpeg"]);
    }

    [Fact]
    [Trait("Case", "TPL-716")]
    public async Task A_clinic_with_no_picture_lists_nothing()
    {
        var (admin, clinic) = await ClinicAsync();

        (await admin.PaperImagesAsync(clinic.Id)).ShouldBeEmpty();
    }

    [Fact]
    [Trait("Case", "TPL-716")]
    public async Task The_picture_returns_its_bytes_as_an_attachment_not_sniffed()
    {
        var (admin, clinic) = await ClinicAsync();
        var bytes = FileSamples.Png();
        const string name = "ورقة العيادة.png";
        var file = await admin.UploadPaperAsync(clinic.Id, name, bytes);

        var response = await admin.GetAsync(PaperImageApi.Item(clinic.Id, file.Id));

        await response.ShouldBeOkAsync();
        (await response.Content.ReadAsByteArrayAsync()).ShouldBeTheBytes(bytes);
        response.Content.Headers.ContentType.ShouldNotBeNull();
        response.Content.Headers.ContentType.MediaType.ShouldBe("image/png");
        response.Content.Headers.ContentDisposition.ShouldNotBeNull();
        response.Content.Headers.ContentDisposition.DispositionType.ShouldBe("attachment");
        response.Content.Headers.ContentDisposition.FileNameStar.ShouldBe(name);
        response.Headers.GetValues("X-Content-Type-Options").ShouldBe(["nosniff"]);
    }

    public static TheoryData<string, string> Refusals => new()
    {
        { "empty", "attachmentEmpty" },
        { "no file part", "attachmentEmpty" },
        { "a name with a control character", "nameInvalid" },
        { "a name of 257 characters", "nameTooLong" },
        { "not multipart", "invalidRequest" },
        { "two files", "invalidRequest" },
    };

    private static HttpContent BodyOf(string upload)
    {
        switch (upload)
        {
            case "empty":
                return MultipartBody.Of("paper.png", []);
            case "no file part":
                return MultipartBody.Raw(MultipartBody.Utf8($"{MultipartBody.FieldPart("note", "no file")}--{MultipartBody.Boundary}--\r\n"));
            case "a name with a control character":
                return MultipartBody.Of("bad\u0001name.png", FileSamples.Png());
            case "a name of 257 characters":
                return MultipartBody.Of(new string('a', 253) + ".png", FileSamples.Png());
            case "not multipart":
                return new StringContent("""{ "name": "paper.png" }""", Encoding.UTF8, "application/json");
            case "two files":
                var body = new MemoryStream();
                foreach (var name in new[] { "a.png", "b.png" })
                {
                    body.Write(MultipartBody.Utf8(MultipartBody.FilePart(name)));
                    body.Write(FileSamples.Png());
                    body.Write("\r\n"u8);
                }
                body.Write(MultipartBody.Utf8($"--{MultipartBody.Boundary}--\r\n"));
                return MultipartBody.Raw(body.ToArray());
            default:
                throw new ArgumentOutOfRangeException(nameof(upload), upload, null);
        }
    }

    [Theory]
    [MemberData(nameof(Refusals))]
    [Trait("Case", "TPL-716")]
    public async Task A_POST_with_no_picture_refuses_a_bad_upload_and_writes_nothing(string upload, string code)
    {
        var (admin, clinic) = await ClinicAsync();

        var response = await admin.SendAsync(new HttpRequestMessage(HttpMethod.Post, PaperImageApi.Route(clinic.Id)) { Content = BodyOf(upload) });

        await response.ShouldBeProblemAsync(HttpStatusCode.BadRequest, code);
        (await App.PaperRowsAsync(clinic.Id)).ShouldBeEmpty();
        Disk.OfClinic(clinic.Id).ShouldBeEmpty();
    }

    [Theory]
    [MemberData(nameof(Refusals))]
    [Trait("Case", "TPL-716")]
    public async Task A_POST_and_a_PUT_on_a_stored_picture_refuse_a_bad_upload_and_change_nothing(string upload, string code)
    {
        var (admin, clinic) = await ClinicAsync();
        var file = await admin.UploadPaperAsync(clinic.Id);
        var nothingChanged = await SnapshotAsync(admin, clinic.Id);

        var post = await admin.SendAsync(new HttpRequestMessage(HttpMethod.Post, PaperImageApi.Route(clinic.Id)) { Content = BodyOf(upload) });
        var put = await admin.SendAsync(new HttpRequestMessage(HttpMethod.Put, PaperImageApi.Item(clinic.Id, file.Id)) { Content = BodyOf(upload) });

        await post.ShouldBeProblemAsync(HttpStatusCode.BadRequest, code);
        await put.ShouldBeProblemAsync(HttpStatusCode.BadRequest, code);
        await nothingChanged();
    }
}
