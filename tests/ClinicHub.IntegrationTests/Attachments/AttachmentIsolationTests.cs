using System.Net;
using ClinicHub.Api.Features.Attachments;
using ClinicHub.Application.Features.Access;
using ClinicHub.IntegrationTests.Attachments.TestHost;
using ClinicHub.IntegrationTests.Harness.Assertions;
using Microsoft.AspNetCore.Routing;
using Microsoft.Extensions.DependencyInjection;
using Shouldly;

namespace ClinicHub.IntegrationTests.Attachments;

/// <summary>
/// One clinic can never read, list, replace or delete another clinic's files (docs/design/attachments.md § 1, § 4; the business file's
/// «كل ملف يتبع عيادة واحدة»), through the test-only clinic route on the real pipeline.
/// </summary>
[Collection(AttachmentsCollection.Name)]
[Trait("Area", "attachments")]
public class AttachmentIsolationTests(AttachmentsAppFixture app) : AttachmentTest(app)
{
    [Fact]
    [Trait("Case", "ATT-001")]
    [Trait("Tier", "Smoke")]
    public async Task Another_clinic_lists_nothing_for_the_same_owner()
    {
        var (_, a) = await ClinicWithOwnerAsync();
        var (_, b) = await ClinicWithOwnerAsync();
        var owner = NewRef();
        await a.StoredAsync(Url(ClinicRoute, M, owner), "a.png", FileSamples.Png());

        (await b.ListedAsync(Url(ClinicRoute, M, owner))).ShouldBeEmpty();
    }

    [Fact]
    [Trait("Case", "ATT-002")]
    [Trait("Tier", "Smoke")]
    public async Task Another_clinic_opening_with_the_right_id_module_and_ref_gets_404()
    {
        var (_, a) = await ClinicWithOwnerAsync();
        var (_, b) = await ClinicWithOwnerAsync();
        var owner = NewRef();
        var file = await a.StoredAsync(Url(ClinicRoute, M, owner), "a.png", FileSamples.Png());

        await ShouldBeNotFoundAsync(b.GetAsync(Url(ClinicRoute, M, owner, file.Id)));
    }

    [Fact]
    [Trait("Case", "ATT-003")]
    [Trait("Tier", "Smoke")]
    public async Task Another_clinic_replacing_gets_404_and_nothing_changes_or_appears()
    {
        var (clinicA, a) = await ClinicWithOwnerAsync();
        var (clinicB, b) = await ClinicWithOwnerAsync();
        var owner = NewRef();
        var original = FileSamples.Png();
        var file = await a.StoredAsync(Url(ClinicRoute, M, owner), "a.png", original);
        var rowBefore = await RowBeforeAsync(file.Id);
        var diskA = Disk.OfClinic(clinicA.Id);
        var diskB = Disk.OfClinic(clinicB.Id);

        await ShouldBeNotFoundAsync(b.ReplaceAsync(Url(ClinicRoute, M, owner, file.Id), "b.png", FileSamples.Png()));

        ShouldBeLive(await RowAsync(file.Id), rowBefore);
        (await RowsOfClinicAsync(clinicA.Id)).Count.ShouldBe(1);
        (await RowsOfClinicAsync(clinicB.Id)).ShouldBeEmpty();
        Disk.OfClinic(clinicA.Id).ShouldBe(diskA);
        Disk.OfClinic(clinicB.Id).ShouldBe(diskB);
        (await a.DownloadedAsync(Url(ClinicRoute, M, owner, file.Id))).ShouldBeTheBytes(original);
    }

    [Fact]
    [Trait("Case", "ATT-004")]
    [Trait("Tier", "Smoke")]
    public async Task Another_clinic_deleting_gets_404_and_the_owner_can_still_open_it()
    {
        var (_, a) = await ClinicWithOwnerAsync();
        var (_, b) = await ClinicWithOwnerAsync();
        var owner = NewRef();
        var original = FileSamples.Png();
        var file = await a.StoredAsync(Url(ClinicRoute, M, owner), "a.png", original);

        await ShouldBeNotFoundAsync(b.DeleteAsync(Url(ClinicRoute, M, owner, file.Id)));

        (await a.DownloadedAsync(Url(ClinicRoute, M, owner, file.Id))).ShouldBeTheBytes(original);
        (await RowAsync(file.Id)).DeletedAt.ShouldBeNull();
    }

    [Fact]
    [Trait("Case", "ATT-005")]
    public async Task The_owner_opening_with_a_different_ref_or_module_gets_404()
    {
        var (_, a) = await ClinicWithOwnerAsync();
        var owner = NewRef();
        var file = await a.StoredAsync(Url(ClinicRoute, M, owner), "a.png", FileSamples.Png());

        await ShouldBeNotFoundAsync(a.GetAsync(Url(ClinicRoute, M, NewRef(), file.Id)));
        await ShouldBeNotFoundAsync(a.GetAsync(Url(ClinicRoute, G, owner, file.Id)));
    }

    [Fact]
    [Trait("Case", "ATT-006")]
    [Trait("Tier", "Smoke")]
    public async Task Two_clinics_with_the_same_owner_each_get_only_their_own_with_the_right_bytes()
    {
        var (_, a) = await ClinicWithOwnerAsync();
        var (_, b) = await ClinicWithOwnerAsync();
        var owner = NewRef();
        var bytesA = FileSamples.Png();
        var bytesB = FileSamples.Png();
        var fileA = await a.StoredAsync(Url(ClinicRoute, M, owner), "a.png", bytesA);
        var fileB = await b.StoredAsync(Url(ClinicRoute, M, owner), "b.png", bytesB);

        (await a.ListedAsync(Url(ClinicRoute, M, owner))).Select(f => f.Id).ShouldBe([fileA.Id]);
        (await b.ListedAsync(Url(ClinicRoute, M, owner))).Select(f => f.Id).ShouldBe([fileB.Id]);
        (await a.DownloadedAsync(Url(ClinicRoute, M, owner, fileA.Id))).ShouldBeTheBytes(bytesA);
        (await b.DownloadedAsync(Url(ClinicRoute, M, owner, fileB.Id))).ShouldBeTheBytes(bytesB);
        await ShouldBeNotFoundAsync(a.GetAsync(Url(ClinicRoute, M, owner, fileB.Id)));
        await ShouldBeNotFoundAsync(b.GetAsync(Url(ClinicRoute, M, owner, fileA.Id)));
    }

    [Fact]
    [Trait("Case", "ATT-007")]
    public async Task A_random_id_answers_exactly_as_another_clinics_file_does()
    {
        var (_, a) = await ClinicWithOwnerAsync();
        var (_, b) = await ClinicWithOwnerAsync();
        var owner = NewRef();
        var file = await a.StoredAsync(Url(ClinicRoute, M, owner), "a.png", FileSamples.Png());

        var otherClinics = await (await b.GetAsync(Url(ClinicRoute, M, owner, file.Id))).ShouldBeProblemAsync(HttpStatusCode.NotFound, "notFound");
        var missing = await (await b.GetAsync(Url(ClinicRoute, M, owner, Guid.NewGuid()))).ShouldBeProblemAsync(HttpStatusCode.NotFound, "notFound");

        missing.Title.ShouldBe(otherClinics.Title);
        missing.Detail.ShouldBe(otherClinics.Detail);
        missing.Type.ShouldBe(otherClinics.Type);
        missing.Errors.ShouldBe(otherClinics.Errors);
    }

    [Fact]
    [Trait("Case", "ATT-008")]
    public async Task A_saved_files_id_is_random_and_its_key_holds_the_clinic_and_the_id_never_the_clients_name()
    {
        var (clinic, a) = await ClinicWithOwnerAsync();

        var first = await a.StoredAsync(Url(ClinicRoute, M, NewRef()), "client-name.png", FileSamples.Png());
        var second = await a.StoredAsync(Url(ClinicRoute, M, NewRef()), "client-name.png", FileSamples.Png());

        // A random GUID (version 4): not time-ordered, so it can't be guessed from another one and shows nothing of how much others upload
        first.Id.Version.ShouldBe(4);
        second.Id.Version.ShouldBe(4);
        var row = await RowAsync(first.Id);
        row.StorageKey.ShouldBe($"clinics/{clinic.Id}/{first.Id:D}");
        row.StorageKey.ShouldNotContain("client-name");
    }

    public static TheoryData<string, string> EveryTestRoute => new()
    {
        { "GET", $"{ClinicRoute}/{M}/r" },
        { "GET", $"{ClinicRoute}/{M}/r/{Guid.Empty}" },
        { "POST", $"{ClinicRoute}/{M}/r" },
        { "POST", $"{ClinicRoute}/{G}/r" },
        { "PUT", $"{ClinicRoute}/{M}/r/{Guid.Empty}" },
        { "PUT", $"{ClinicRoute}/{G}/r/{Guid.Empty}" },
        { "DELETE", $"{ClinicRoute}/{M}/r/{Guid.Empty}" },
        { "DELETE", $"{ClinicRoute}/{M}/r" },
        { "GET", $"{PlatformRoute}/{M}/r" },
        { "GET", $"{PlatformRoute}/{M}/r/{Guid.Empty}" },
        { "POST", $"{Inside}/{M}/r" },
        { "POST", $"{Inside}/{G}/r" },
        { "POST", $"{Outside}/{G}/r" },
        { "PUT", $"{Inside}/{G}/r/{Guid.Empty}" },
        { "PUT", $"{Outside}/{G}/r/{Guid.Empty}" },
        { "DELETE", $"{Inside}/{M}/r/{Guid.Empty}" },
        { "DELETE", $"{Outside}/{M}/r/{Guid.Empty}" },
        { "DELETE", $"{Outside}/{M}/r" },
        { "GET", $"{AttachmentTestRoutes.Admin(1)}/{M}/r" },
        { "GET", $"{AttachmentTestRoutes.Admin(1)}/{M}/r/{Guid.Empty}" },
        { "POST", $"{AttachmentTestRoutes.Admin(1)}/{M}/r" },
        { "POST", $"{AttachmentTestRoutes.Admin(1)}/{G}/r" },
        { "PUT", $"{AttachmentTestRoutes.Admin(1)}/{G}/r/{Guid.Empty}" },
        { "DELETE", $"{AttachmentTestRoutes.Admin(1)}/{M}/r/{Guid.Empty}" },
    };

    [Theory]
    [Trait("Case", "ATT-009")]
    [MemberData(nameof(EveryTestRoute))]
    public async Task No_token_on_any_test_route_answers_401(string method, string url)
    {
        var response = await Anonymous().SendAsync(new HttpRequestMessage(new HttpMethod(method), url));

        await response.ShouldBeProblemAsync(HttpStatusCode.Unauthorized, "unauthorized");
    }

    [Fact]
    [Trait("Case", "ATT-010")]
    public async Task A_role_without_the_routes_permission_gets_403_and_nothing_is_written()
    {
        var clinic = await Data.Clinic();
        var listOnly = await Login.WithPermissionsAsync(clinic, Permissions.Drugs.List);
        var before = Disk.OfClinic(clinic.Id);

        var response = await listOnly.UploadAsync(Url(ClinicRoute, M, NewRef()), "a.png", FileSamples.Png());

        await response.ShouldBeProblemAsync(HttpStatusCode.Forbidden, "forbidden");
        (await RowsOfClinicAsync(clinic.Id)).ShouldBeEmpty();
        Disk.OfClinic(clinic.Id).ShouldBe(before);
    }

    [Fact]
    [Trait("Case", "ATT-011")]
    public async Task The_staff_of_a_suspended_clinic_get_403_clinicSuspended()
    {
        var (clinic, owner) = await ClinicWithOwnerAsync();
        var refId = NewRef();
        var file = await owner.StoredAsync(Url(ClinicRoute, M, refId), "a.png", FileSamples.Png());

        await Data.SuspendClinicAsync(clinic);

        await (await owner.GetAsync(Url(ClinicRoute, M, refId))).ShouldBeProblemAsync(HttpStatusCode.Forbidden, "clinicSuspended");
        await (await owner.GetAsync(Url(ClinicRoute, M, refId, file.Id))).ShouldBeProblemAsync(HttpStatusCode.Forbidden, "clinicSuspended");
        await (await owner.UploadAsync(Url(ClinicRoute, M, refId), "b.png", FileSamples.Png())).ShouldBeProblemAsync(HttpStatusCode.Forbidden, "clinicSuspended");
    }

    [Fact]
    [Trait("Case", "ATT-011")]
    public async Task The_staff_of_a_deleted_clinic_get_403_noAccess()
    {
        var (clinic, owner) = await ClinicWithOwnerAsync();
        var refId = NewRef();
        var file = await owner.StoredAsync(Url(ClinicRoute, M, refId), "a.png", FileSamples.Png());

        await Data.DeleteClinicAsync(clinic);

        await (await owner.GetAsync(Url(ClinicRoute, M, refId))).ShouldBeProblemAsync(HttpStatusCode.Forbidden, "noAccess");
        await (await owner.GetAsync(Url(ClinicRoute, M, refId, file.Id))).ShouldBeProblemAsync(HttpStatusCode.Forbidden, "noAccess");
        await (await owner.UploadAsync(Url(ClinicRoute, M, refId), "b.png", FileSamples.Png())).ShouldBeProblemAsync(HttpStatusCode.Forbidden, "noAccess");
    }

    [Fact]
    [Trait("Case", "ATT-012")]
    [Trait("Tier", "Smoke")]
    public async Task The_real_host_has_no_endpoint_with_the_upload_filter()
    {
        await using var realHost = App.CreateVariant();
        realHost.Start();

        var endpoints = realHost.Services.GetRequiredService<EndpointDataSource>().Endpoints;

        endpoints.ShouldNotBeEmpty();
        endpoints.Where(e => e.Metadata.GetMetadata<AttachmentUploadAttribute>() is not null).Select(e => e.DisplayName).ShouldBeEmpty();
        // The check can see the filter: the test host, with its test part, has such endpoints
        Host.Factory.Services.GetRequiredService<EndpointDataSource>().Endpoints
            .ShouldContain(e => e.Metadata.GetMetadata<AttachmentUploadAttribute>() != null);
    }

    [Fact]
    [Trait("Case", "ATT-013")]
    public async Task A_clinicId_in_the_query_or_the_form_is_ignored_the_row_belongs_to_the_tokens_clinic()
    {
        var (clinicA, a) = await ClinicWithOwnerAsync();
        var clinicB = await Data.Clinic();
        var before = Disk.OfClinic(clinicB.Id);
        var request = new HttpRequestMessage(HttpMethod.Post, $"{Url(ClinicRoute, M, NewRef())}?clinicId={clinicB.Id}")
        {
            Content = MultipartBody.Of("a.png", FileSamples.Png(), fields: [("clinicId", clinicB.Id.ToString())]),
        };

        var file = await (await a.SendAsync(request)).ShouldBeStoredAsync();

        var row = await RowAsync(file.Id);
        row.ClinicId.ShouldBe(clinicA.Id);
        row.StorageKey.ShouldStartWith($"clinics/{clinicA.Id}/");
        (await RowsOfClinicAsync(clinicB.Id)).ShouldBeEmpty();
        Disk.OfClinic(clinicB.Id).ShouldBe(before);
    }

    [Fact]
    [Trait("Case", "ATT-014")]
    public async Task The_owner_replacing_or_deleting_with_a_wrong_ref_or_module_gets_404_and_nothing_changes()
    {
        var (clinic, a) = await ClinicWithOwnerAsync();
        var owner = NewRef();
        var original = FileSamples.Png();
        var file = await a.StoredAsync(Url(ClinicRoute, M, owner), "a.png", original);
        var rowBefore = await RowBeforeAsync(file.Id);
        var before = Disk.OfClinic(clinic.Id);

        await ShouldBeNotFoundAsync(a.ReplaceAsync(Url(ClinicRoute, M, NewRef(), file.Id), "b.png", FileSamples.Png()));
        await ShouldBeNotFoundAsync(a.ReplaceAsync(Url(ClinicRoute, G, owner, file.Id), "b.png", FileSamples.Png()));
        // The old row is found before the new file's rules run: a refused file on the wrong owner is still 404
        await ShouldBeNotFoundAsync(a.ReplaceAsync(Url(ClinicRoute, M, NewRef(), file.Id), "setup.exe", FileSamples.Exe()));
        await ShouldBeNotFoundAsync(a.ReplaceAsync(Url(ClinicRoute, G, owner, file.Id), "setup.exe", FileSamples.Exe()));
        await ShouldBeNotFoundAsync(a.DeleteAsync(Url(ClinicRoute, M, NewRef(), file.Id)));
        await ShouldBeNotFoundAsync(a.DeleteAsync(Url(ClinicRoute, G, owner, file.Id)));

        ShouldBeLive(await RowAsync(file.Id), rowBefore);
        (await RowsOfClinicAsync(clinic.Id)).Count.ShouldBe(1);
        Disk.OfClinic(clinic.Id).ShouldBe(before);
        (await a.DownloadedAsync(Url(ClinicRoute, M, owner, file.Id))).ShouldBeTheBytes(original);
    }
}
