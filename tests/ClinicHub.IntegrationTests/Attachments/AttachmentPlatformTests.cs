using System.Net;
using ClinicHub.IntegrationTests.Attachments.TestHost;
using ClinicHub.IntegrationTests.Harness.Assertions;
using ClinicHub.Application.Common.Abstractions;
using ClinicHub.Infrastructure.Database;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Shouldly;

namespace ClinicHub.IntegrationTests.Attachments;

/// <summary>The super admin on a clinic's route, and platform files: a row with no clinic (docs/design/attachments.md § 4, § 7, A9).</summary>
[Collection(AttachmentsCollection.Name)]
[Trait("Area", "attachments")]
public class AttachmentPlatformTests(AttachmentsAppFixture app) : AttachmentTest(app)
{
    [Fact]
    [Trait("Case", "ATT-020")]
    public async Task The_super_admin_on_a_clinics_admin_route_stores_the_file_in_that_clinic_and_its_staff_reach_it()
    {
        var (clinic, staff) = await ClinicWithOwnerAsync();
        var admin = await Login.SuperAdminAsync();
        var owner = NewRef();
        var bytes = FileSamples.Png();

        var file = await admin.StoredAsync(Url(AttachmentTestRoutes.Admin(clinic.Id), M, owner), "a.png", bytes);

        var row = await RowAsync(file.Id);
        row.ClinicId.ShouldBe(clinic.Id);
        row.StorageKey.ShouldBe($"clinics/{clinic.Id}/{file.Id:D}");
        Disk.Read(row.StorageKey).ShouldBeTheBytes(bytes);
        (await staff.ListedAsync(Url(ClinicRoute, M, owner))).Select(f => f.Id).ShouldBe([file.Id]);
        (await staff.DownloadedAsync(Url(ClinicRoute, M, owner, file.Id))).ShouldBeTheBytes(bytes);
    }

    [Fact]
    [Trait("Case", "ATT-021")]
    public async Task The_super_admin_on_another_clinics_admin_route_gets_404_for_a_file()
    {
        var clinicA = await Data.Clinic();
        var clinicB = await Data.Clinic();
        var admin = await Login.SuperAdminAsync();
        var owner = NewRef();
        var file = await admin.StoredAsync(Url(AttachmentTestRoutes.Admin(clinicA.Id), M, owner), "a.png", FileSamples.Png());

        await ShouldBeNotFoundAsync(admin.GetAsync(Url(AttachmentTestRoutes.Admin(clinicB.Id), M, owner, file.Id)));
    }

    [Fact]
    [Trait("Case", "ATT-022")]
    public async Task A_clinic_token_on_an_admin_route_gets_403()
    {
        var (clinic, owner) = await ClinicWithOwnerAsync();

        var response = await owner.UploadAsync(Url(AttachmentTestRoutes.Admin(clinic.Id), M, NewRef()), "a.png", FileSamples.Png());

        await response.ShouldBeProblemAsync(HttpStatusCode.Forbidden, "forbidden");
        (await RowsOfClinicAsync(clinic.Id)).ShouldBeEmpty();
    }

    [Fact]
    [Trait("Case", "ATT-022")]
    public async Task A_missing_deleted_or_template_clinic_on_an_admin_route_gets_404()
    {
        var admin = await Login.SuperAdminAsync();
        var deleted = await Data.Clinic().Deleted();
        var template = await App.TemplateClinicIdAsync();

        foreach (var clinicId in new[] { int.MaxValue, deleted.Id, template })
        {
            var rowsBefore = (await RowsOfClinicAsync(clinicId)).Count;
            await ShouldBeNotFoundAsync(admin.GetAsync(Url(AttachmentTestRoutes.Admin(clinicId), M, NewRef())));
            await ShouldBeNotFoundAsync(admin.UploadAsync(Url(AttachmentTestRoutes.Admin(clinicId), M, NewRef()), "a.png", FileSamples.Png()));
            (await RowsOfClinicAsync(clinicId)).Count.ShouldBe(rowsBefore);
        }
    }

    [Fact]
    [Trait("Case", "ATT-023")]
    public async Task The_super_admin_in_the_template_clinics_context_stores_the_file_in_the_template()
    {
        var admin = await Login.SuperAdminInTemplateAsync();
        var template = await App.TemplateClinicIdAsync();

        var file = await admin.StoredAsync(Url(ClinicRoute, M, NewRef()), "a.png", FileSamples.Png());

        var row = await RowAsync(file.Id);
        row.ClinicId.ShouldBe(template);
        row.StorageKey.ShouldBe($"clinics/{template}/{file.Id:D}");
    }

    [Fact]
    [Trait("Case", "ATT-024")]
    [Trait("Tier", "Smoke")]
    public async Task A_platform_upload_inside_the_block_has_no_clinic_and_a_platform_key()
    {
        var admin = await Login.SuperAdminAsync();
        var bytes = FileSamples.Png();

        var file = await admin.StoredAsync(Url(Inside, M, NewRef()), "a.png", bytes);

        var row = await RowAsync(file.Id);
        row.ClinicId.ShouldBeNull();
        row.StorageKey.ShouldBe($"platform/{file.Id:D}");
        Disk.Read(row.StorageKey).ShouldBeTheBytes(bytes);
    }

    [Fact]
    [Trait("Case", "ATT-025")]
    [Trait("Tier", "Smoke")]
    public async Task A_platform_upload_outside_the_block_throws_and_writes_nothing()
    {
        var admin = await Login.SuperAdminAsync();
        var owner = NewRef();
        var before = Disk.All();

        var response = await admin.UploadAsync(Url(Outside, G, owner), "a.png", FileSamples.Png());

        await response.ShouldBeProblemAsync(HttpStatusCode.InternalServerError, "unexpected");
        (await PlatformRowsAsync(owner)).ShouldBeEmpty();
        Disk.All().ShouldBe(before);
        Seams.Written.ShouldBeEmpty();
    }

    [Fact]
    [Trait("Case", "ATT-026")]
    public async Task A_clinic_route_for_a_platform_files_owner_lists_and_opens_it()
    {
        var (_, staff) = await ClinicWithOwnerAsync();
        var admin = await Login.SuperAdminAsync();
        var owner = NewRef();
        var bytes = FileSamples.Png();
        var file = await admin.StoredAsync(Url(Inside, M, owner), "a.png", bytes);

        (await staff.ListedAsync(Url(ClinicRoute, M, owner))).Select(f => f.Id).ShouldBe([file.Id]);
        (await staff.DownloadedAsync(Url(ClinicRoute, M, owner, file.Id))).ShouldBeTheBytes(bytes);
    }

    [Fact]
    [Trait("Case", "ATT-027")]
    [Trait("Tier", "Smoke")]
    public async Task A_clinic_replacing_or_deleting_a_platform_file_gets_404_and_it_is_unchanged()
    {
        var (clinic, staff) = await ClinicWithOwnerAsync();
        var admin = await Login.SuperAdminAsync();
        var owner = NewRef();
        var file = await admin.StoredAsync(Url(Inside, G, owner), "a.png", FileSamples.Png());
        var rowBefore = await RowAsync(file.Id);
        var before = Disk.All();

        await ShouldBeNotFoundAsync(staff.ReplaceAsync(Url(ClinicRoute, G, owner, file.Id), "b.png", FileSamples.Png()));
        await ShouldBeNotFoundAsync(staff.DeleteAsync(Url(ClinicRoute, G, owner, file.Id)));

        ShouldBeLive(await RowAsync(file.Id), rowBefore);
        (await PlatformRowsAsync(owner)).Count.ShouldBe(1);
        (await RowsOfClinicAsync(clinic.Id)).ShouldBeEmpty();
        Disk.All().ShouldBe(before);
    }

    [Fact]
    [Trait("Case", "ATT-028")]
    public async Task A_platform_route_sees_nothing_of_a_clinics_file()
    {
        var (clinic, staff) = await ClinicWithOwnerAsync();
        var admin = await Login.SuperAdminAsync();
        var owner = NewRef();
        var file = await staff.StoredAsync(Url(ClinicRoute, G, owner), "a.png", FileSamples.Png());
        var rowBefore = await RowAsync(file.Id);
        var before = Disk.All();

        (await admin.ListedAsync(Url(PlatformRoute, G, owner))).ShouldBeEmpty();
        await ShouldBeNotFoundAsync(admin.GetAsync(Url(PlatformRoute, G, owner, file.Id)));
        await ShouldBeNotFoundAsync(admin.ReplaceAsync(Url(Inside, G, owner, file.Id), "b.png", FileSamples.Png()));
        await ShouldBeNotFoundAsync(admin.DeleteAsync(Url(Inside, G, owner, file.Id)));

        ShouldBeLive(await RowAsync(file.Id), rowBefore);
        (await RowsOfClinicAsync(clinic.Id)).Count.ShouldBe(1);
        (await PlatformRowsAsync(owner)).ShouldBeEmpty();
        Disk.All().ShouldBe(before);
    }

    [Fact]
    [Trait("Case", "ATT-029")]
    [Trait("Tier", "Smoke")]
    public async Task A_platform_file_through_a_clinic_route_of_a_different_module_is_404()
    {
        var (_, staff) = await ClinicWithOwnerAsync();
        var admin = await Login.SuperAdminAsync();
        var owner = NewRef();
        var file = await admin.StoredAsync(Url(Inside, M, owner), "a.png", FileSamples.Png());

        await ShouldBeNotFoundAsync(staff.GetAsync(Url(ClinicRoute, G, owner, file.Id)));
    }

    [Fact]
    [Trait("Case", "ATT-030")]
    public async Task The_super_admin_is_stamped_by_user_id_though_they_have_no_staff_row()
    {
        var clinic = await Data.Clinic();
        var admin = await Login.SuperAdminAsync();
        var phone = App.SuperAdminPhone;
        var userId = await Host.QueryDbAsync(db => db.Users.Where(u => u.Phone == phone).Select(u => u.Id).SingleAsync());
        (await Host.QueryDbAsync(db => db.Staff.IgnoreQueryFilters().AnyAsync(s => s.UserId == userId))).ShouldBeFalse("a super admin with no staff row");
        var route = AttachmentTestRoutes.Admin(clinic.Id);
        var owner = NewRef();

        var file = await admin.StoredAsync(Url(route, M, owner), "a.png", FileSamples.Png());

        (await RowAsync(file.Id)).CreatedByUserId.ShouldBe(userId);

        await (await admin.DeleteAsync(Url(route, M, owner, file.Id))).ShouldBeAsync(HttpStatusCode.NoContent);

        var deleted = await RowAsync(file.Id);
        deleted.DeletedByUserId.ShouldBe(userId);
        deleted.CreatedByUserId.ShouldBe(userId);
    }

    [Fact]
    [Trait("Case", "ATT-031")]
    public async Task With_no_clinic_and_outside_the_block_replace_and_delete_throw_before_writing_anything()
    {
        var admin = await Login.SuperAdminAsync();
        var owner = NewRef();
        var bytes = FileSamples.Png();
        var file = await admin.StoredAsync(Url(Inside, G, owner), "a.png", bytes);
        var rowBefore = await RowAsync(file.Id);
        var before = Disk.All();
        Seams.Written.Clear();

        await (await admin.ReplaceAsync(Url(Outside, G, owner, file.Id), "b.png", FileSamples.Png())).ShouldBeProblemAsync(HttpStatusCode.InternalServerError, "unexpected");
        await (await admin.DeleteAsync(Url(Outside, G, owner, file.Id))).ShouldBeProblemAsync(HttpStatusCode.InternalServerError, "unexpected");
        await (await admin.DeleteAsync(Url(Outside, G, owner))).ShouldBeProblemAsync(HttpStatusCode.InternalServerError, "unexpected");

        ShouldBeLive(await RowAsync(file.Id), rowBefore);
        (await PlatformRowsAsync(owner)).Count.ShouldBe(1);
        Disk.All().ShouldBe(before);
        Seams.Written.ShouldBeEmpty();
    }

    [Fact]
    [Trait("Case", "ATT-032")]
    public async Task Through_EF_changing_the_clinic_of_a_row_throws_on_save()
    {
        var (clinicA, staff) = await ClinicWithOwnerAsync();
        var clinicB = await Data.Clinic();
        var file = await staff.StoredAsync(Url(ClinicRoute, G, NewRef()), "a.png", FileSamples.Png());
        var key = (await RowAsync(file.Id)).StorageKey;

        await using var scope = Host.Factory.Services.CreateAsyncScope();
        using var inClinic = scope.ServiceProvider.GetRequiredService<IClinicScope>().Use(clinicA.Id);
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var row = await db.Attachments.IgnoreQueryFilters().SingleAsync(a => a.Id == file.Id);
        row.ClinicId = clinicB.Id;

        await Should.ThrowAsync<InvalidOperationException>(() => db.SaveChangesAsync());

        var after = await RowAsync(file.Id);
        after.ClinicId.ShouldBe(clinicA.Id);
        after.StorageKey.ShouldBe(key);
    }

    [Fact]
    [Trait("Case", "ATT-032")]
    public async Task Through_EF_changing_a_platform_row_in_a_clinic_throws_on_save()
    {
        var clinic = await Data.Clinic();
        var admin = await Login.SuperAdminAsync();
        var file = await admin.StoredAsync(Url(Inside, G, NewRef()), "a.png", FileSamples.Png());

        await using var scope = Host.Factory.Services.CreateAsyncScope();
        using var inClinic = scope.ServiceProvider.GetRequiredService<IClinicScope>().Use(clinic.Id);
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var row = await db.Attachments.IgnoreQueryFilters().SingleAsync(a => a.Id == file.Id);
        row.DeletedAt = Clock.GetUtcNow().UtcDateTime;

        await Should.ThrowAsync<InvalidOperationException>(() => db.SaveChangesAsync());

        (await RowAsync(file.Id)).DeletedAt.ShouldBeNull();
    }

    [Fact]
    [Trait("Case", "ATT-033")]
    [Trait("Tier", "Smoke")]
    public async Task A_clinic_token_on_a_platform_route_gets_403_with_no_row_or_file()
    {
        var (_, staff) = await ClinicWithOwnerAsync();
        var owner = NewRef();
        var before = Disk.All();

        var response = await staff.UploadAsync(Url(Inside, G, owner), "a.png", FileSamples.Png());

        await response.ShouldBeProblemAsync(HttpStatusCode.Forbidden, "forbidden");
        (await PlatformRowsAsync(owner)).ShouldBeEmpty();
        Disk.All().ShouldBe(before);
    }

    [Fact]
    [Trait("Case", "ATT-034")]
    [Trait("Tier", "Smoke")]
    public async Task Delete_all_in_a_clinic_marks_only_that_clinics_rows_and_never_throws_for_a_platform_file()
    {
        var (_, staff) = await ClinicWithOwnerAsync();
        var admin = await Login.SuperAdminAsync();
        var owner = NewRef();
        var platformFile = await admin.StoredAsync(Url(Inside, G, owner), "platform.png", FileSamples.Png());
        var clinicFile = await staff.StoredAsync(Url(ClinicRoute, G, owner), "clinic.png", FileSamples.Png());
        var platformBefore = await RowAsync(platformFile.Id);

        await (await staff.DeleteAsync(Url(ClinicRoute, G, owner))).ShouldBeAsync(HttpStatusCode.NoContent);

        (await RowAsync(clinicFile.Id)).DeletedAt.ShouldBe(Clock.GetUtcNow().UtcDateTime);
        ShouldBeLive(await RowAsync(platformFile.Id), platformBefore);
        (await staff.ListedAsync(Url(ClinicRoute, G, owner))).Select(f => f.Id).ShouldBe([platformFile.Id]);
    }
}
