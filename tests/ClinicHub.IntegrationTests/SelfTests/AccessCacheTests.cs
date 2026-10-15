using System.Net;
using ClinicHub.Application.Features.Access;
using ClinicHub.Domain.Platform;
using ClinicHub.IntegrationTests.Harness.Assertions;
using ClinicHub.IntegrationTests.Harness.Clients;
using ClinicHub.IntegrationTests.Harness.Hosting;
using Shouldly;

namespace ClinicHub.IntegrationTests.SelfTests;

/// <summary>
/// The access cache inside the test host works as in production: right after a login the next request's answer is
/// cached (a change made outside the app, i.e. an invalidation the app forgot, is not seen), and a change through the
/// app invalidates it after the commit (the next request sees it, no waiting). The tests that rely on an invalidation
/// first prove the cache is warm, so a missing invalidation makes them fail.
/// </summary>
[Collection(InfraCollectionB.Name)]
[Trait("Area", "infra")]
public class AccessCacheTests(AppFixture app) : IntegrationTest(app)
{
    [Fact]
    public async Task Right_after_a_login_the_cache_holds_the_answer()
    {
        var clinic = await Data.Clinic();
        var staff = await Data.Staff(clinic).WithRole("Doctor");
        var doctor = await Login.StaffAsync(staff);
        await (await doctor.GetAsync("/api/v1/drugs")).ShouldBeOkAsync();

        // No invalidation (a change by hand) and the clock untouched: the cached "active staff" still answers
        await DeactivateOutsideTheAppAsync(staff.Id);

        await (await doctor.GetAsync("/api/v1/drugs")).ShouldBeOkAsync();
    }

    [Fact]
    public async Task Deactivating_through_the_admin_api_locks_the_staff_member_out_on_the_next_request()
    {
        var clinic = await Data.Clinic();
        var staff = await Data.Staff(clinic).WithRole("Doctor");
        var doctor = await Login.StaffAsync(staff);
        await ShouldBeCachedAsync(doctor, clinic.Id);
        var admin = await Login.SuperAdminAsync();

        await (await admin.PutAsync($"/api/v1/admin/clinics/{clinic.Id}/staff/{staff.Id}",
            new { fullName = staff.FullName, isActive = false, roleIds = new[] { clinic.RoleId("Doctor") } })).ShouldBeOkAsync();

        await (await doctor.GetAsync("/api/v1/drugs")).ShouldBeProblemAsync(HttpStatusCode.Forbidden, "noAccess");
    }

    [Fact]
    public async Task Suspending_a_clinic_through_the_admin_api_applies_on_the_next_request()
    {
        var clinic = await Data.Clinic();
        var owner = await Login.OwnerAsync(clinic);
        await ShouldBeCachedAsync(owner, clinic.Id);
        var admin = await Login.SuperAdminAsync();

        await (await admin.PostAsync($"/api/v1/admin/clinics/{clinic.Id}/suspend")).ShouldBeAsync(HttpStatusCode.NoContent);

        await (await owner.GetAsync("/api/v1/drugs")).ShouldBeProblemAsync(HttpStatusCode.Forbidden, "clinicSuspended");
    }

    [Fact]
    public async Task A_role_change_by_a_builder_applies_on_the_next_request()
    {
        var clinic = await Data.Clinic();
        var role = await Data.Role(clinic).WithPermissions(Permissions.Drugs.List);
        var staff = await Data.Staff(clinic).WithRoles(role.Id);
        var user = await Login.StaffAsync(staff);
        await (await user.GetAsync("/api/v1/drugs")).ShouldBeOkAsync();

        await Data.UpdateRoleAsync(clinic, role.Id, role.Name, Permissions.Groups.List);

        await (await user.GetAsync("/api/v1/drugs")).ShouldBeProblemAsync(HttpStatusCode.Forbidden, "forbidden");
        await (await user.GetAsync("/api/v1/drug-groups")).ShouldBeOkAsync();
        (await user.MeAsync()).Permissions.ShouldBe([Permissions.Groups.List]);
    }

    [Fact]
    public async Task An_answer_cached_under_a_moved_clock_does_not_outlive_the_test()
    {
        var clinic = await Data.Clinic();
        var staff = await Data.Staff(clinic).WithRole("Doctor");
        Clock.Advance(TimeSpan.FromHours(1));
        var doctor = await Login.StaffAsync(staff);
        // Cached now, an hour ahead of the next test's clock: "active staff"
        await (await doctor.GetAsync("/api/v1/drugs")).ShouldBeOkAsync();

        // What happens between two tests of the class: the clock goes back to the real time
        await App.BeforeTestAsync(GetType());
        doctor.AccessToken = await App.Tokens.ReissueAsync(doctor, Clock.GetUtcNow());
        await Data.DeactivateStaffAsync(staff);

        await (await doctor.GetAsync("/api/v1/drugs")).ShouldBeProblemAsync(HttpStatusCode.Forbidden, "noAccess");
    }

    [Fact]
    public async Task A_tag_invalidated_under_a_moved_clock_does_not_turn_the_cache_off_later()
    {
        var clinic = await Data.Clinic();
        var staff = await Data.Staff(clinic).WithRole("Doctor");
        Clock.Advance(TimeSpan.FromHours(1));
        // The login invalidates the staff member's tags an hour ahead of the next test's clock
        await Login.StaffAsync(staff);

        await App.BeforeTestAsync(GetType());
        var doctor = await Login.StaffAsync(staff);
        await (await doctor.GetAsync("/api/v1/drugs")).ShouldBeOkAsync();
        await DeactivateOutsideTheAppAsync(staff.Id);

        await (await doctor.GetAsync("/api/v1/drugs")).ShouldBeOkAsync();
    }

    /// <summary>
    /// Caches the caller's access and proves it is cached: the clinic suspended by hand (no invalidation) is not seen.
    /// Then put back, so that only an invalidation by the app can change the next answer.
    /// </summary>
    private async Task ShouldBeCachedAsync(ApiClient client, int clinicId)
    {
        await (await client.GetAsync("/api/v1/drugs")).ShouldBeOkAsync();
        await SetClinicStatusOutsideTheAppAsync(clinicId, ClinicStatus.Suspended);
        await (await client.GetAsync("/api/v1/drugs")).ShouldBeOkAsync();
        await SetClinicStatusOutsideTheAppAsync(clinicId, ClinicStatus.Active);
    }

    private Task DeactivateOutsideTheAppAsync(int staffId) =>
        App.OutsideTheApp.ExecuteAsync("""UPDATE "Staff" SET "IsActive" = false WHERE "Id" = @p0""", staffId);

    private Task SetClinicStatusOutsideTheAppAsync(int clinicId, string status) =>
        App.OutsideTheApp.ExecuteAsync("""UPDATE "Clinics" SET "Status" = @p0 WHERE "Id" = @p1""", status, clinicId);
}
