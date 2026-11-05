using System.Net;
using ClinicHub.IntegrationTests.Attachments.TestHost;
using ClinicHub.IntegrationTests.Harness.Assertions;
using Npgsql;
using Shouldly;

namespace ClinicHub.IntegrationTests.Attachments;

/// <summary>Files are streamed through a feature's route, never by a URL (docs/design/attachments.md § 7, A10), and what the table keeps (§ 4, A14).</summary>
[Collection(AttachmentsCollection2.Name)]
[Trait("Area", "attachments")]
public class AttachmentServingTests(AttachmentsAppFixture app) : AttachmentTest(app)
{
    [Fact]
    [Trait("Case", "ATT-140")]
    public async Task A_download_has_the_uploaded_bytes_and_the_checked_content_type_not_the_declared_one()
    {
        var (_, owner) = await ClinicWithOwnerAsync();
        var refId = NewRef();
        var bytes = FileSamples.Png();
        var file = await (await owner.UploadAsync(Url(ClinicRoute, G, refId), "a.png", bytes, "text/html")).ShouldBeStoredAsync();

        var response = await owner.GetAsync(Url(ClinicRoute, G, refId, file.Id));

        await response.ShouldBeOkAsync();
        response.Content.Headers.ContentType.ShouldNotBeNull();
        response.Content.Headers.ContentType.MediaType.ShouldBe("image/png");
        (await response.Content.ReadAsByteArrayAsync()).ShouldBeTheBytes(bytes);
    }

    [Theory]
    [Trait("Case", "ATT-141")]
    [InlineData("a.png", "png")]
    [InlineData("a.pdf", "pdf")]
    public async Task A_download_is_always_an_attachment_not_sniffed_and_not_cached(string name, string kind)
    {
        var (_, owner) = await ClinicWithOwnerAsync();
        var refId = NewRef();
        var file = await owner.StoredAsync(Url(ClinicRoute, G, refId), name, kind == "png" ? FileSamples.Png() : FileSamples.Pdf());

        var response = await owner.GetAsync(Url(ClinicRoute, G, refId, file.Id));

        await response.ShouldBeOkAsync();
        response.Content.Headers.ContentDisposition.ShouldNotBeNull();
        response.Content.Headers.ContentDisposition.DispositionType.ShouldBe("attachment");
        response.Headers.GetValues("X-Content-Type-Options").ShouldBe(["nosniff"]);
        response.Headers.CacheControl.ShouldNotBeNull();
        response.Headers.CacheControl.Private.ShouldBeTrue();
        response.Headers.CacheControl.NoStore.ShouldBeTrue();
    }

    [Fact]
    [Trait("Case", "ATT-142")]
    public async Task A_stored_files_key_or_folder_requested_by_url_never_returns_its_bytes()
    {
        var (clinic, owner) = await ClinicWithOwnerAsync();
        var refId = NewRef();
        var secret = $"a secret line {Guid.NewGuid():N}";
        var bytes = FileSamples.Text(secret);
        var file = await owner.StoredAsync(Url(ClinicRoute, G, refId), "notes.txt", bytes);
        var key = (await RowAsync(file.Id)).StorageKey;
        var encoded = Uri.EscapeDataString(key);

        foreach (var url in new[]
        {
            $"/{key}", $"/{encoded}", $"/clinics/{clinic.Id}", $"/clinics/{clinic.Id}/", $"/attachments/{key}", $"/files/{key}", $"/uploads/{key}",
            $"/wwwroot/{key}", $"/api/v1/{key}", $"/api/v1/attachments/{file.Id}", $"/attachments/{file.Id}", $"/{file.Id}", $"/?path={encoded}",
            $"/../{key}", $"/%2e%2e/{key}",
        })
        {
            foreach (var client in new[] { owner, Anonymous() })
            {
                var response = await client.GetAsync(url);

                var body = await response.Content.ReadAsByteArrayAsync();
                System.Text.Encoding.UTF8.GetString(body).ShouldNotContain(secret, customMessage: url);
            }
        }
    }

    [Fact]
    [Trait("Case", "ATT-143")]
    public async Task A_failed_download_is_the_usual_problem_without_the_file_headers()
    {
        var (_, owner) = await ClinicWithOwnerAsync();

        var response = await owner.GetAsync(Url(ClinicRoute, G, NewRef(), Guid.NewGuid()));

        await response.ShouldBeProblemAsync(HttpStatusCode.NotFound, "notFound");
        response.Content.Headers.ContentDisposition.ShouldBeNull();
        response.Headers.Contains("X-Content-Type-Options").ShouldBeFalse();
        (response.Headers.CacheControl is { NoStore: true }).ShouldBeFalse();
    }

    [Fact]
    [Trait("Case", "ATT-144")]
    public async Task A_list_is_newest_first()
    {
        var (_, owner) = await ClinicWithOwnerAsync();
        var refId = NewRef();
        var oldest = await owner.StoredAsync(Url(ClinicRoute, G, refId), "1.png", FileSamples.Png());
        var oldestAt = Clock.GetUtcNow().UtcDateTime;
        Clock.Advance(TimeSpan.FromSeconds(1));
        var middle = await owner.StoredAsync(Url(ClinicRoute, G, refId), "2.png", FileSamples.Png());
        var middleAt = Clock.GetUtcNow().UtcDateTime;
        Clock.Advance(TimeSpan.FromSeconds(1));
        var newest = await owner.StoredAsync(Url(ClinicRoute, G, refId), "3.png", FileSamples.Png());
        var newestAt = Clock.GetUtcNow().UtcDateTime;
        Clock.Advance(TimeSpan.FromSeconds(1));

        var listed = await owner.ListedAsync(Url(ClinicRoute, G, refId));

        listed.Select(f => f.Id).ShouldBe([newest.Id, middle.Id, oldest.Id]);
        listed.Select(f => f.CreatedAt).ShouldBe([newestAt, middleAt, oldestAt], "each row holds the time of its upload");
        oldest.CreatedAt.ShouldBe(oldestAt, "the upload's answer holds it too");
        middle.CreatedAt.ShouldBe(middleAt, "the upload's answer holds it too");
        newest.CreatedAt.ShouldBe(newestAt, "the upload's answer holds it too");
    }

    [Fact]
    [Trait("Case", "ATT-144")]
    public async Task Rows_with_the_same_time_are_ordered_by_id()
    {
        var (_, owner) = await ClinicWithOwnerAsync();
        var refId = NewRef();
        var ids = new List<Guid>();
        // The clock stands still: same CreatedAt
        for (var i = 0; i < 6; i++)
            ids.Add((await owner.StoredAsync(Url(ClinicRoute, G, refId), $"{i}.png", FileSamples.Png())).Id);

        var listed = (await owner.ListedAsync(Url(ClinicRoute, G, refId))).Select(f => f.Id.ToString("D")).ToList();

        // The design says "CreatedAt, then Id" without the direction of the tie break: the order must follow the IDs, one way or the other
        listed.ShouldBe(ids.Select(id => id.ToString("D")), ignoreOrder: true);
        var ascending = listed.Order(StringComparer.Ordinal).ToList();
        (listed.SequenceEqual(ascending) || listed.SequenceEqual(ascending.AsEnumerable().Reverse())).ShouldBeTrue(string.Join(", ", listed));
    }

    [Fact]
    [Trait("Case", "ATT-144")]
    public async Task No_list_row_exposes_the_storage_key()
    {
        var (_, owner) = await ClinicWithOwnerAsync();
        var refId = NewRef();
        var file = await owner.StoredAsync(Url(ClinicRoute, G, refId), "a.png", FileSamples.Png());
        var key = (await RowAsync(file.Id)).StorageKey;

        var response = await owner.GetAsync(Url(ClinicRoute, G, refId));

        var body = await response.ShouldBeOkAsync();
        body.ShouldNotContain(key);
        body.ShouldNotContain("clinics/");
        var row = (await response.ReadNodeAsync()).AsArray().ShouldHaveSingleItem().AsObject();
        row.ContainsKey("storageKey").ShouldBeFalse();
    }

    [Fact]
    [Trait("Case", "ATT-182")]
    public async Task Deleting_a_user_with_attachments_is_restricted_by_the_foreign_key()
    {
        var clinic = await Data.Clinic();
        var admin = await Login.SuperAdminAsync();
        var file = await admin.StoredAsync(Url(AttachmentTestRoutes.Admin(clinic.Id), G, NewRef()), "a.png", FileSamples.Png());
        var row = await RowAsync(file.Id);

        var refused = await Should.ThrowAsync<PostgresException>(() =>
            App.OutsideTheApp.ExecuteAsync("""DELETE FROM "Users" WHERE "Id" = @p0""", row.CreatedByUserId));

        refused.ConstraintName.ShouldBe("FK_Attachments_Users_CreatedByUserId");
        (await RowAsync(file.Id)).CreatedByUserId.ShouldBe(row.CreatedByUserId);
        (await App.OutsideTheApp.ScalarAsync<string>(
            """
            SELECT string_agg(c.confdeltype::text, ',') FROM pg_constraint c
            WHERE c.contype = 'f' AND c.conrelid = '"Attachments"'::regclass AND c.confrelid = '"Users"'::regclass
            """)).ShouldBe("r,r", "both user links restrict");
    }

    [Fact]
    [Trait("Case", "ATT-183")]
    public async Task The_table_keeps_the_users_name_while_the_file_on_disk_is_named_by_the_rows_guid()
    {
        var (clinic, owner) = await ClinicWithOwnerAsync();
        const string name = "تقرير المريض.pdf";
        var bytes = FileSamples.Pdf();

        var file = await owner.StoredAsync(Url(ClinicRoute, G, NewRef()), name, bytes);

        file.OriginalFileName.ShouldBe(name);
        var row = await RowAsync(file.Id);
        row.OriginalFileName.ShouldBe(name);
        row.TypeKey.ShouldBe("pdf");
        row.StorageKey.ShouldBe($"clinics/{clinic.Id}/{file.Id:D}");
        var onDisk = Directory.GetFiles(Path.Combine(Disk.Root, "clinics", clinic.Id.ToString())).ShouldHaveSingleItem();
        Path.GetFileName(onDisk).ShouldBe(file.Id.ToString("D"));
        Path.GetExtension(onDisk).ShouldBeEmpty();
        File.ReadAllBytes(onDisk).ShouldBeTheBytes(bytes);
    }
}
