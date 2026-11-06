using System.Net;
using ClinicHub.Application.Features.Access.Roles;
using ClinicHub.IntegrationTests.Attachments.TestHost;
using ClinicHub.IntegrationTests.Harness.Assertions;
using ClinicHub.IntegrationTests.Harness.Builders;
using ClinicHub.IntegrationTests.Harness.Clients;
using ClinicHub.IntegrationTests.Harness.Hosting;
using Shouldly;

namespace ClinicHub.IntegrationTests.Admin.PrescriptionTemplates;

/// <summary>
/// Who reaches the paper image, on which clinics (step 4 design § 4, A13): only a current super admin's platform token, on a clinic that's managed; another clinic's
/// picture doesn't exist. All six routes wherever a case says five (contract § 10.5).
/// </summary>
[Collection(AdminCollection7.Name)]
[Trait("Area", "admin")]
public class PaperImageAccessTests(AppFixture app) : IntegrationTest(app)
{
    private const int UnknownId = 999_999;

    private AttachmentDisk Disk => new(App.Factory.AttachmentRoot);

    private static async Task EveryRouteAnswersAsync(ApiClient client, int clinicId, Guid id, HttpStatusCode status, string code)
    {
        var routes = PaperImageApi.EveryRoute(clinicId, id);
        routes.Count.ShouldBe(6);
        foreach (var route in routes)
            await (await route(client)).ShouldBeProblemAsync(status, code);
    }

    /// <summary>A clinic with a picture; the check says its rows and files are exactly as they were.</summary>
    private async Task<(ClinicHandle Clinic, Guid PictureId, Func<Task> NothingChanged)> ClinicWithAPictureAsync()
    {
        var admin = await Login.SharedSuperAdminAsync();
        var clinic = await Data.Clinic();
        var file = await admin.UploadPaperAsync(clinic.Id);
        var rows = (await App.PaperRowsAsync(clinic.Id)).Select(r => (r.Id, r.DeletedAt)).ToList();
        var disk = Disk.OfClinic(clinic.Id);
        return (clinic, file.Id, async () =>
        {
            (await App.PaperRowsAsync(clinic.Id)).Select(r => (r.Id, r.DeletedAt)).ShouldBe(rows, ignoreOrder: true);
            Disk.OfClinic(clinic.Id).ShouldBe(disk);
        });
    }

    // ---- TPL-667: another clinic's picture ----

    [Fact]
    [Trait("Case", "TPL-667")]
    [Trait("Tier", "Smoke")]
    public async Task Clinic_As_picture_on_clinic_Bs_route_is_404_for_read_replace_and_delete()
    {
        var admin = await Login.SharedSuperAdminAsync();
        var (clinicA, picture, nothingChanged) = await ClinicWithAPictureAsync();
        var clinicB = await Data.Clinic();
        var url = PaperImageApi.Item(clinicB.Id, picture);

        await (await admin.GetAsync(url)).ShouldBeProblemAsync(HttpStatusCode.NotFound, "notFound");
        await (await admin.DeleteAsync(url)).ShouldBeProblemAsync(HttpStatusCode.NotFound, "notFound");
        await (await admin.ReplaceAsync(url, "paper.png", FileSamples.Png())).ShouldBeProblemAsync(HttpStatusCode.NotFound, "notFound");

        await nothingChanged();
        (await admin.PaperImagesAsync(clinicA.Id)).ShouldHaveSingleItem().Id.ShouldBe(picture);
        (await admin.PaperImagesAsync(clinicB.Id)).ShouldBeEmpty();
        (await App.PaperRowsAsync(clinicB.Id)).ShouldBeEmpty();
        Disk.OfClinic(clinicB.Id).ShouldBeEmpty();
    }

    [Fact]
    [Trait("Case", "TPL-667")]
    public async Task Each_clinic_lists_only_its_own_picture_and_a_POST_on_B_leaves_As_alone()
    {
        var admin = await Login.SharedSuperAdminAsync();
        var (clinicA, picture, nothingChanged) = await ClinicWithAPictureAsync();
        var clinicB = await Data.Clinic();

        var other = await admin.UploadPaperAsync(clinicB.Id);

        await nothingChanged();
        (await admin.PaperImagesAsync(clinicA.Id)).ShouldHaveSingleItem().Id.ShouldBe(picture);
        (await admin.PaperImagesAsync(clinicB.Id)).ShouldHaveSingleItem().Id.ShouldBe(other.Id);
        (await App.PaperRowsAsync(clinicB.Id)).ShouldHaveSingleItem().StorageKey.ShouldBe($"clinics/{clinicB.Id}/{other.Id:D}");
    }

    // ---- TPL-668: tokens ----

    [Fact]
    [Trait("Case", "TPL-668")]
    [Trait("Tier", "Smoke")]
    public async Task No_token_gets_401_on_all_six_routes_and_nothing_changes()
    {
        var (clinic, picture, nothingChanged) = await ClinicWithAPictureAsync();

        await EveryRouteAnswersAsync(Anonymous(), clinic.Id, picture, HttpStatusCode.Unauthorized, "unauthorized");

        await nothingChanged();
    }

    [Fact]
    [Trait("Case", "TPL-668")]
    [Trait("Tier", "Smoke")]
    public async Task The_clinic_owners_token_gets_403_on_all_six_routes_and_nothing_changes()
    {
        var (clinic, picture, nothingChanged) = await ClinicWithAPictureAsync();
        var owner = await Login.OwnerAsync(clinic);

        await EveryRouteAnswersAsync(owner, clinic.Id, picture, HttpStatusCode.Forbidden, "forbidden");

        await nothingChanged();
    }

    [Theory]
    [Trait("Case", "TPL-668")]
    [InlineData(DefaultRoles.Doctor)]
    [InlineData(DefaultRoles.Assistant)]
    public async Task A_staff_token_gets_403_on_all_six_routes_and_nothing_changes(string role)
    {
        var (clinic, picture, nothingChanged) = await ClinicWithAPictureAsync();
        var staff = await Login.WithRoleAsync(clinic, role);

        await EveryRouteAnswersAsync(staff, clinic.Id, picture, HttpStatusCode.Forbidden, "forbidden");

        await nothingChanged();
    }

    [Fact]
    [Trait("Case", "TPL-668")]
    public async Task The_super_admin_in_the_template_clinics_context_gets_403_on_all_six_routes()
    {
        var (clinic, picture, nothingChanged) = await ClinicWithAPictureAsync();
        var inTemplate = await Login.SuperAdminInTemplateAsync();

        await EveryRouteAnswersAsync(inTemplate, clinic.Id, picture, HttpStatusCode.Forbidden, "forbidden");

        await nothingChanged();
    }

    // ---- TPL-669: clinics ----

    [Fact]
    [Trait("Case", "TPL-669")]
    public async Task A_missing_clinic_is_notFound_on_all_six_routes()
    {
        var admin = await Login.SharedSuperAdminAsync();

        await EveryRouteAnswersAsync(admin, UnknownId, Guid.NewGuid(), HttpStatusCode.NotFound, "notFound");

        (await App.PaperRowsAsync(UnknownId)).ShouldBeEmpty();
        Disk.OfClinic(UnknownId).ShouldBeEmpty();
    }

    [Fact]
    [Trait("Case", "TPL-669")]
    public async Task A_deleted_clinic_is_notFound_on_all_six_routes_and_nothing_changes()
    {
        var admin = await Login.SharedSuperAdminAsync();
        var (clinic, picture, nothingChanged) = await ClinicWithAPictureAsync();
        await Data.DeleteClinicAsync(clinic);

        await EveryRouteAnswersAsync(admin, clinic.Id, picture, HttpStatusCode.NotFound, "notFound");

        await nothingChanged();
    }

    [Fact]
    [Trait("Case", "TPL-669")]
    public async Task The_template_clinic_is_notFound_on_all_six_routes_and_never_holds_a_picture()
    {
        var admin = await Login.SharedSuperAdminAsync();
        var template = await App.TemplateClinicIdAsync();
        var before = Disk.OfClinic(template);

        await EveryRouteAnswersAsync(admin, template, Guid.NewGuid(), HttpStatusCode.NotFound, "notFound");

        (await App.PaperRowsAsync(template)).ShouldBeEmpty();
        Disk.OfClinic(template).ShouldBe(before);
    }

    [Fact]
    [Trait("Case", "TPL-669")]
    public async Task A_suspended_clinic_is_managed_on_all_six_routes()
    {
        var admin = await Login.SharedSuperAdminAsync();
        var clinic = await Data.Clinic().Suspended();
        var bytes = FileSamples.Png();

        await (await admin.GetAsync(PaperImageApi.Rules(clinic.Id))).ShouldBeOkAsync();
        var file = await admin.UploadPaperAsync(clinic.Id);
        Clock.Advance(TimeSpan.FromSeconds(1));
        var replaced = await (await admin.ReplaceAsync(PaperImageApi.Item(clinic.Id, file.Id), "new.png", bytes)).ShouldBeStoredAsync();
        (await admin.PaperImagesAsync(clinic.Id)).ShouldHaveSingleItem().Id.ShouldBe(replaced.Id);
        (await admin.DownloadedAsync(PaperImageApi.Item(clinic.Id, replaced.Id))).ShouldBeTheBytes(bytes);
        await (await admin.DeleteAsync(PaperImageApi.Item(clinic.Id, replaced.Id))).ShouldBeAsync(HttpStatusCode.NoContent);
        (await admin.PaperImagesAsync(clinic.Id)).ShouldBeEmpty();
    }
}
