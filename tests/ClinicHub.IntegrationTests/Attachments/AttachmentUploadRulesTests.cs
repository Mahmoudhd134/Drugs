using System.Net;
using System.Text;
using ClinicHub.Application.Common.Settings;
using ClinicHub.IntegrationTests.Attachments.TestHost;
using ClinicHub.IntegrationTests.Harness.Assertions;
using ClinicHub.IntegrationTests.Harness.Clients;
using ClinicHub.IntegrationTests.Harness.Hosting;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Shouldly;

namespace ClinicHub.IntegrationTests.Attachments;

/// <summary>What an upload may hold: its type, size and name (docs/design/attachments.md § 5), through the real filter and service.</summary>
[Collection(AttachmentsCollection2.Name)]
[Trait("Area", "attachments")]
public class AttachmentUploadRulesTests(AttachmentsAppFixture app) : AttachmentTest(app)
{
    private const int MegaByte = (int)AttachmentSettings.BytesPerMb;
    private const int LimitOfM = 2 * MegaByte;
    private const int GlobalLimit = 20 * MegaByte;

    private async Task ShouldBeRefusedAsync(HttpStatusCode status, string code, string url, string name, byte[] bytes, string declaredType = "application/octet-stream")
    {
        var (clinic, owner) = await ClinicWithOwnerAsync();
        var before = Disk.OfClinic(clinic.Id);

        var response = await owner.UploadAsync($"{ClinicRoute}/{url}", name, bytes, declaredType);

        await response.ShouldBeProblemAsync(status, code);
        (await RowsOfClinicAsync(clinic.Id)).ShouldBeEmpty();
        Disk.OfClinic(clinic.Id).ShouldBe(before);
        Seams.Written.ShouldBeEmpty();
    }

    private Task ShouldBeRefusedAsync(string code, string url, string name, byte[] bytes, string declaredType = "application/octet-stream") =>
        ShouldBeRefusedAsync(HttpStatusCode.BadRequest, code, url, name, bytes, declaredType);

    private static string InM() => $"{M}/{NewRef()}";

    private static string InG() => $"{G}/{NewRef()}";

    // ---- Types ----

    [Fact]
    [Trait("Case", "ATT-042")]
    public async Task A_PNG_named_jpg_is_refused() =>
        await ShouldBeRefusedAsync("attachmentTypeNotAllowed", InM(), "photo.jpg", FileSamples.Png());

    [Fact]
    [Trait("Case", "ATT-042")]
    public async Task A_JPEG_named_png_is_refused() =>
        await ShouldBeRefusedAsync("attachmentTypeNotAllowed", InM(), "photo.png", FileSamples.Jpeg());

    [Theory]
    [Trait("Case", "ATT-043")]
    [InlineData("photo.png")]
    [InlineData("report.pdf")]
    public async Task An_executable_named_as_an_allowed_type_is_refused(string name) =>
        await ShouldBeRefusedAsync("attachmentTypeNotAllowed", InG(), name, FileSamples.Exe());

    [Fact]
    [Trait("Case", "ATT-044")]
    public async Task A_declared_image_type_on_an_exe_changes_nothing() =>
        await ShouldBeRefusedAsync("attachmentTypeNotAllowed", InG(), "setup.exe", FileSamples.Png(), "image/png");

    [Fact]
    [Trait("Case", "ATT-044")]
    public async Task A_PDF_declared_as_html_is_stored_as_a_PDF()
    {
        var (_, owner) = await ClinicWithOwnerAsync();

        var file = await (await owner.UploadAsync($"{ClinicRoute}/{InG()}", "report.pdf", FileSamples.Pdf(), "text/html")).ShouldBeStoredAsync();

        file.TypeKey.ShouldBe("pdf");
        file.ContentType.ShouldBe("application/pdf");
    }

    [Fact]
    [Trait("Case", "ATT-055")]
    public async Task A_type_the_module_refuses_is_refused_there()
    {
        await ShouldBeRefusedAsync("attachmentTypeNotAllowed", InM(), "report.pdf", FileSamples.Pdf());
    }

    [Fact]
    [Trait("Case", "ATT-055")]
    public async Task The_same_type_is_accepted_in_a_module_with_no_entry()
    {
        var (_, owner) = await ClinicWithOwnerAsync();

        (await owner.StoredAsync($"{ClinicRoute}/{InG()}", "report.pdf", FileSamples.Pdf())).TypeKey.ShouldBe("pdf");
    }

    // ---- Config ----

    [Theory]
    [Trait("Case", "ATT-060")]
    [InlineData("Attachments:AllowedTypes", "png,jpeg,exe2", "exe2")]
    [InlineData("Attachments:Modules:clinicPaper:AllowedTypes", "png,exe3", "exe3")]
    public void An_unknown_type_key_stops_the_app_and_the_message_names_it(string key, string value, string named)
    {
        using var variant = App.CreateVariant(new Dictionary<string, string> { [key] = value });

        Should.Throw<InvalidOperationException>(variant.Start).Message.ShouldContain(named);
    }

    [Fact]
    [Trait("Case", "ATT-065")]
    public async Task A_module_with_no_entry_uses_the_global_type_list_and_size()
    {
        var (clinic, owner) = await ClinicWithOwnerAsync();
        var atTheLimit = FileSamples.Pdf(GlobalLimit);
        var before = Disk.OfClinic(clinic.Id);

        (await owner.StoredAsync($"{ClinicRoute}/{InG()}", "at-the-limit.pdf", atTheLimit)).SizeBytes.ShouldBe(GlobalLimit);
        var after = Disk.OfClinic(clinic.Id);
        after.Count.ShouldBe(before.Count + 1);

        await (await owner.UploadAsync($"{ClinicRoute}/{InG()}", "over.pdf", FileSamples.Pdf(GlobalLimit + 1)))
            .ShouldBeProblemAsync(HttpStatusCode.BadRequest, "attachmentTooLarge");
        Disk.OfClinic(clinic.Id).ShouldBe(after);
    }

    [Fact]
    [Trait("Case", "ATT-068")]
    public async Task A_later_config_source_with_a_shorter_list_replaces_the_base_list_whole()
    {
        var clinic = await Data.Clinic();
        await using var variant = Host.CreateHostVariant(new Dictionary<string, string>
        {
            ["Attachments:AllowedTypes"] = "png,jpeg",
            ["Attachments:Modules:clinicPaper:AllowedTypes"] = "png",
        });
        var owner = await Login.On(variant).OwnerAsync(clinic);

        // The base file's global list holds pdf, and its clinicPaper list holds jpeg
        await (await owner.UploadAsync($"{ClinicRoute}/{InG()}", "report.pdf", FileSamples.Pdf())).ShouldBeProblemAsync(HttpStatusCode.BadRequest, "attachmentTypeNotAllowed");
        await (await owner.UploadAsync($"{ClinicRoute}/{InM()}", "photo.jpg", FileSamples.Jpeg())).ShouldBeProblemAsync(HttpStatusCode.BadRequest, "attachmentTypeNotAllowed");
        (await (await owner.UploadAsync($"{ClinicRoute}/{InG()}", "photo.jpg", FileSamples.Jpeg())).ShouldBeStoredAsync()).TypeKey.ShouldBe("jpeg");
        (await (await owner.UploadAsync($"{ClinicRoute}/{InM()}", "photo.png", FileSamples.Png())).ShouldBeStoredAsync()).TypeKey.ShouldBe("png");
    }

    [Fact]
    [Trait("Case", "ATT-072")]
    public void A_root_that_is_really_a_file_stops_the_app()
    {
        var file = Path.GetTempFileName();
        try
        {
            using var variant = App.CreateVariant(new Dictionary<string, string> { [ClinicHubFactory.AttachmentRootKey] = file });

            Should.Throw<InvalidOperationException>(variant.Start);
        }
        finally
        {
            File.Delete(file);
        }
    }

    // ---- Size ----

    [Fact]
    [Trait("Case", "ATT-080")]
    public async Task A_file_exactly_at_the_modules_limit_passes()
    {
        var (_, owner) = await ClinicWithOwnerAsync();
        var bytes = FileSamples.Png(LimitOfM);

        var file = await owner.StoredAsync($"{ClinicRoute}/{InM()}", "at-the-limit.png", bytes);

        file.SizeBytes.ShouldBe(LimitOfM);
    }

    [Fact]
    [Trait("Case", "ATT-080")]
    public async Task One_byte_over_the_modules_limit_is_refused_and_nothing_is_written() =>
        await ShouldBeRefusedAsync("attachmentTooLarge", InM(), "over.png", FileSamples.Png(LimitOfM + 1));

    [Fact]
    [Trait("Case", "ATT-081")]
    public async Task A_Content_Length_far_past_the_limit_is_refused() =>
        await ShouldBeRefusedAsync("attachmentTooLarge", InM(), "far-over.png", FileSamples.Png(5 * MegaByte));

    [Fact]
    [Trait("Case", "ATT-083")]
    public async Task A_file_over_the_modules_limit_is_refused_there() =>
        await ShouldBeRefusedAsync("attachmentTooLarge", InM(), "big.png", FileSamples.Png(3 * MegaByte));

    [Fact]
    [Trait("Case", "ATT-083")]
    public async Task The_same_file_is_accepted_under_the_global_limit()
    {
        var (_, owner) = await ClinicWithOwnerAsync();

        var file = await owner.StoredAsync($"{ClinicRoute}/{InG()}", "big.png", FileSamples.Png(3 * MegaByte));

        file.SizeBytes.ShouldBe(3 * MegaByte);
    }

    [Fact]
    [Trait("Case", "ATT-084")]
    public async Task A_zero_byte_file_is_refused() =>
        await ShouldBeRefusedAsync("attachmentEmpty", InM(), "empty.png", []);

    [Fact]
    [Trait("Case", "ATT-084")]
    public async Task A_request_with_no_file_part_is_refused()
    {
        var (clinic, owner) = await ClinicWithOwnerAsync();
        var body = MultipartBody.Raw(MultipartBody.Utf8($"{MultipartBody.FieldPart("note", "no file")}--{MultipartBody.Boundary}--\r\n"));

        var response = await owner.SendAsync(new HttpRequestMessage(HttpMethod.Post, $"{ClinicRoute}/{InM()}") { Content = body });

        await response.ShouldBeProblemAsync(HttpStatusCode.BadRequest, "attachmentEmpty");
        (await RowsOfClinicAsync(clinic.Id)).ShouldBeEmpty();
    }

    [Fact]
    [Trait("Case", "ATT-084")]
    public async Task A_part_with_an_empty_file_name_is_a_form_field_so_a_missing_file_part() =>
        await ShouldBeRefusedAsync("attachmentEmpty", InM(), "", FileSamples.Png());

    [Fact]
    [Trait("Case", "ATT-085")]
    public async Task No_token_and_a_huge_body_answers_401_not_a_size_error()
    {
        var response = await Anonymous().UploadAsync($"{ClinicRoute}/{InM()}", "huge.png", FileSamples.Png(5 * MegaByte));

        await response.ShouldBeProblemAsync(HttpStatusCode.Unauthorized, "unauthorized");
    }

    [Fact]
    [Trait("Case", "ATT-085")]
    public async Task No_permission_and_a_huge_body_answers_403_not_a_size_error()
    {
        var clinic = await Data.Clinic();
        var listOnly = await Login.WithPermissionsAsync(clinic, Application.Features.Access.Permissions.Drugs.List);

        var response = await listOnly.UploadAsync($"{ClinicRoute}/{InM()}", "huge.png", FileSamples.Png(5 * MegaByte));

        await response.ShouldBeProblemAsync(HttpStatusCode.Forbidden, "forbidden");
    }

    // ---- Names ----

    [Theory]
    [Trait("Case", "ATT-086")]
    [InlineData("../../evil.png")]
    [InlineData("..\\..\\evil.png")]
    [InlineData("C:\\Users\\someone\\evil.png")]
    [InlineData("/etc/evil.png")]
    [InlineData("\\\\server\\share\\evil.png")]
    public async Task Only_the_last_segment_of_a_path_name_is_stored_and_the_disk_key_is_unchanged(string name)
    {
        var (clinic, owner) = await ClinicWithOwnerAsync();
        var bytes = FileSamples.Png();
        var parentOfRoot = Directory.GetParent(Disk.Root)!.FullName;

        var file = await owner.StoredAsync($"{ClinicRoute}/{InG()}", name, bytes);

        file.OriginalFileName.ShouldBe("evil.png");
        var row = await RowAsync(file.Id);
        row.OriginalFileName.ShouldBe("evil.png");
        row.StorageKey.ShouldBe($"clinics/{clinic.Id}/{file.Id:D}");
        Disk.Read(row.StorageKey).ShouldBeTheBytes(bytes);
        Disk.All().ShouldNotContain(entry => entry.Contains("evil", StringComparison.OrdinalIgnoreCase));
        File.Exists(Path.Combine(parentOfRoot, "evil.png")).ShouldBeFalse();
    }

    [Fact]
    [Trait("Case", "ATT-087")]
    public async Task A_name_with_a_control_character_a_line_break_or_a_bidi_override_is_refused()
    {
        // In the test's body, not its arguments: control characters don't belong in a test's display name
        foreach (var name in new[] { "bad\u0001name.png", "bad\nname.png", "bad\r\nname.png", "evil\u202Efdp.exe", "evil\u202Egnp.png" })
            await ShouldBeRefusedAsync("nameInvalid", InG(), name, FileSamples.Png());
    }

    [Theory]
    [Trait("Case", "ATT-096")]
    [InlineData("   ")]
    [InlineData("folder/")]
    [InlineData("folder\\")]
    [InlineData(".png")]
    public async Task A_blank_name_a_name_ending_in_a_slash_or_only_an_extension_is_refused(string name) =>
        await ShouldBeRefusedAsync("attachmentTypeNotAllowed", InG(), name, FileSamples.Png());

    [Theory]
    [Trait("Case", "ATT-096")]
    [InlineData("CON.png")]
    [InlineData("a.exe.png")]
    [InlineData("a.exe:.png")]
    public async Task Odd_names_are_judged_by_the_last_extension_and_never_touch_the_path(string name)
    {
        var (clinic, owner) = await ClinicWithOwnerAsync();
        var bytes = FileSamples.Png();

        var file = await owner.StoredAsync($"{ClinicRoute}/{InG()}", name, bytes);

        file.TypeKey.ShouldBe("png");
        file.OriginalFileName.ShouldBe(name);
        var row = await RowAsync(file.Id);
        row.StorageKey.ShouldBe($"clinics/{clinic.Id}/{file.Id:D}");
        Disk.Read(row.StorageKey).ShouldBeTheBytes(bytes);
    }

    [Fact]
    [Trait("Case", "ATT-096")]
    public async Task A_name_of_256_Arabic_characters_downloads_intact()
    {
        var (_, owner) = await ClinicWithOwnerAsync();
        var refId = NewRef();
        var name = new string('ت', 252) + ".png";
        name.Length.ShouldBe(256);

        var file = await owner.StoredAsync($"{ClinicRoute}/{G}/{refId}", name, FileSamples.Png());
        var response = await owner.GetAsync(Url(ClinicRoute, G, refId, file.Id));

        await response.ShouldBeOkAsync();
        file.OriginalFileName.ShouldBe(name);
        response.Content.Headers.ContentDisposition.ShouldNotBeNull();
        response.Content.Headers.ContentDisposition.FileNameStar.ShouldBe(name);
    }

    [Fact]
    [Trait("Case", "ATT-089")]
    public async Task An_Arabic_file_name_comes_back_correct_when_downloaded()
    {
        var (_, owner) = await ClinicWithOwnerAsync();
        var refId = NewRef();
        const string name = "تقرير المريض.png";

        var file = await owner.StoredAsync($"{ClinicRoute}/{G}/{refId}", name, FileSamples.Png());
        var response = await owner.GetAsync(Url(ClinicRoute, G, refId, file.Id));

        await response.ShouldBeOkAsync();
        response.Content.Headers.ContentDisposition.ShouldNotBeNull();
        response.Content.Headers.ContentDisposition.FileNameStar.ShouldBe(name);
    }

    [Fact]
    [Trait("Case", "ATT-090")]
    public async Task Two_uploads_with_the_same_name_are_both_kept()
    {
        var (_, owner) = await ClinicWithOwnerAsync();
        var refId = NewRef();
        var firstBytes = FileSamples.Png();
        var secondBytes = FileSamples.Png();

        var first = await owner.StoredAsync($"{ClinicRoute}/{G}/{refId}", "same.png", firstBytes);
        var second = await owner.StoredAsync($"{ClinicRoute}/{G}/{refId}", "same.png", secondBytes);

        first.Id.ShouldNotBe(second.Id);
        (await owner.ListedAsync($"{ClinicRoute}/{G}/{refId}")).Select(f => f.Id).ShouldBe([first.Id, second.Id], ignoreOrder: true);
        (await owner.DownloadedAsync(Url(ClinicRoute, G, refId, first.Id))).ShouldBeTheBytes(firstBytes);
        (await owner.DownloadedAsync(Url(ClinicRoute, G, refId, second.Id))).ShouldBeTheBytes(secondBytes);
    }

    // ---- Malformed bodies (contract § 2) ----

    private async Task ShouldBeRefusedByBodyAsync(string code, HttpContent body)
    {
        var (clinic, owner) = await ClinicWithOwnerAsync();
        var before = Disk.OfClinic(clinic.Id);

        var response = await owner.SendAsync(new HttpRequestMessage(HttpMethod.Post, $"{ClinicRoute}/{InM()}") { Content = body });

        await response.ShouldBeProblemAsync(HttpStatusCode.BadRequest, code);
        (await RowsOfClinicAsync(clinic.Id)).ShouldBeEmpty();
        Disk.OfClinic(clinic.Id).ShouldBe(before);
        Seams.Written.ShouldBeEmpty();
    }

    [Fact]
    [Trait("Case", "ATT-094")]
    public async Task A_wrong_field_name_binds_no_file_and_answers_attachmentEmpty() =>
        await ShouldBeRefusedByBodyAsync("attachmentEmpty", MultipartBody.Of("a.png", FileSamples.Png(), field: "document"));

    [Fact]
    [Trait("Case", "ATT-094")]
    public async Task Two_file_parts_answer_invalidRequest()
    {
        var body = new MemoryStream();
        foreach (var (name, bytes) in new[] { ("a.png", FileSamples.Png()), ("b.png", FileSamples.Png()) })
        {
            body.Write(MultipartBody.Utf8(MultipartBody.FilePart(name)));
            body.Write(bytes);
            body.Write("\r\n"u8);
        }
        body.Write(MultipartBody.Utf8($"--{MultipartBody.Boundary}--\r\n"));

        await ShouldBeRefusedByBodyAsync("invalidRequest", MultipartBody.Raw(body.ToArray()));
    }

    [Theory]
    [Trait("Case", "ATT-094")]
    [InlineData("application/json", "{\"name\":\"a.png\"}")]
    [InlineData("text/plain", "not a form")]
    public async Task A_body_that_is_not_multipart_answers_invalidRequest(string contentType, string body) =>
        await ShouldBeRefusedByBodyAsync("invalidRequest", new StringContent(body, Encoding.UTF8, contentType));

    [Fact]
    [Trait("Case", "ATT-094")]
    public async Task A_multipart_body_with_no_boundary_answers_invalidRequest() =>
        await ShouldBeRefusedByBodyAsync("invalidRequest", MultipartBody.Raw(MultipartBody.Utf8("anything"), "multipart/form-data"));

    [Fact]
    [Trait("Case", "ATT-094")]
    public async Task A_name_past_the_multipart_header_limit_answers_invalidRequest() =>
        await ShouldBeRefusedByBodyAsync("invalidRequest", MultipartBody.Of(new string('a', 20_000) + ".png", FileSamples.Png()));

    [Fact]
    [Trait("Case", "ATT-094")]
    public async Task A_body_with_no_closing_boundary_answers_invalidRequest()
    {
        var body = new MemoryStream();
        body.Write(MultipartBody.Utf8(MultipartBody.FilePart("a.png")));
        body.Write(FileSamples.Png());

        await ShouldBeRefusedByBodyAsync("invalidRequest", MultipartBody.Raw(body.ToArray()));
    }

    [Fact]
    [Trait("Case", "ATT-097")]
    public async Task The_size_stored_is_the_real_length_not_what_the_client_declared()
    {
        var (_, owner) = await ClinicWithOwnerAsync();
        var bytes = FileSamples.Png(1000);
        var request = new HttpRequestMessage(HttpMethod.Post, $"{ClinicRoute}/{InG()}")
        {
            Content = MultipartBody.Of("a.png", bytes, extraHeaders: "Content-Length: 7\r\n"),
        };

        var file = await (await owner.SendAsync(request)).ShouldBeStoredAsync();

        file.SizeBytes.ShouldBe(1000);
        (await RowAsync(file.Id)).SizeBytes.ShouldBe(1000);
    }

    [Fact]
    [Trait("Case", "ATT-099")]
    public async Task No_log_line_at_any_level_holds_the_original_file_name()
    {
        const string marker = "PatientName-q7z4k";
        var clinic = await Data.Clinic();
        var logs = new CapturedLogs();
        await using var variant = Host.CreateHostVariant(new Dictionary<string, string>
        {
            ["Logging:LogLevel:Default"] = "Trace",
            ["Logging:LogLevel:Microsoft.AspNetCore"] = "Trace",
            ["Logging:LogLevel:Microsoft.AspNetCore.StaticFiles"] = "Trace",
            ["Logging:LogLevel:Microsoft.EntityFrameworkCore"] = "Trace",
            ["Logging:LogLevel:Microsoft.EntityFrameworkCore.Database.Command"] = "Trace",
            ["Logging:LogLevel:Microsoft.EntityFrameworkCore.Model.Validation"] = "Trace",
        }, logs.Register);
        var owner = await Login.On(variant).OwnerAsync(clinic);
        logs.Clear();
        var url = $"{ClinicRoute}/{InG()}";

        var stored = await (await owner.UploadAsync(url, $"{marker}.png", FileSamples.Png())).ShouldBeStoredAsync();
        await owner.DownloadedAsync($"{url}/{stored.Id}");
        await (await owner.UploadAsync(url, $"{marker}.exe", FileSamples.Exe())).ShouldBeProblemAsync(HttpStatusCode.BadRequest, "attachmentTypeNotAllowed");
        await (await owner.UploadAsync(url, $"{marker}.png", FileSamples.Exe())).ShouldBeProblemAsync(HttpStatusCode.BadRequest, "attachmentTypeNotAllowed");
        await (await owner.UploadAsync(url, $"{marker}\u0001.png", FileSamples.Png())).ShouldBeProblemAsync(HttpStatusCode.BadRequest, "nameInvalid");
        variant.Services.GetRequiredService<AttachmentSeams>().FailAttachmentSave = true;
        await (await owner.UploadAsync(url, $"{marker}.png", FileSamples.Png())).ShouldBeProblemAsync(HttpStatusCode.InternalServerError, "unexpected");

        foreach (var level in new[] { LogLevel.Trace, LogLevel.Debug, LogLevel.Information, LogLevel.Error })
            logs.All.ShouldContain(e => e.Level == level, $"the variant logs at {level}");
        logs.All.ShouldContain(e => e.Level == LogLevel.Information && (e.Message ?? "").Contains(nameof(ClinicAttachmentsTestController.Open), StringComparison.Ordinal), "the download went through the logged pipeline");
        logs.All.Where(e => (e.Message ?? "").Contains(marker, StringComparison.Ordinal) || (e.Exception ?? "").Contains(marker, StringComparison.Ordinal))
            .Select(e => $"{e.Category} {e.Level}: {e.Message}").ShouldBeEmpty();
    }
}
