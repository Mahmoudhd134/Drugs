using System.Net;
using ClinicHub.Application.Features.Access;
using ClinicHub.IntegrationTests.Harness.Assertions;
using ClinicHub.IntegrationTests.Harness.Hosting;
using Shouldly;

namespace ClinicHub.IntegrationTests.SelfTests;

/// <summary>
/// The access cache inside the test host: a change through the app invalidates it after the commit (the next request
/// sees it, no waiting), and the builders' changes take the same path.
/// </summary>
[Collection(InfraCollectionB.Name)]
[Trait("Area", "infra")]
public class AccessCacheTests(AppFixture app) : IntegrationTest(app)
{
    [Fact]
    public async Task Deactivating_through_the_admin_api_locks_the_staff_member_out_on_the_next_request()
    {
        var clinic = await Data.Clinic();
        var staff = await Data.Staff(clinic).WithRole("Doctor");
        var doctor = await Login.StaffAsync(staff);
        // Cached now: active staff
        await (await doctor.GetAsync("/api/v1/drugs")).ShouldBeOkAsync();
        var admin = await Login.SuperAdminAsync();

        await (await admin.PutAsync($"/api/v1/admin/clinics/{clinic.Id}/staff/{staff.Id}",
            new { fullName = staff.FullName, isActive = false, roleIds = new[] { clinic.RoleId("Doctor") } })).ShouldBeOkAsync();

        await (await doctor.GetAsync("/api/v1/drugs")).ShouldBeProblemAsync(HttpStatusCode.Forbidden, "noAccess");
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
        // Past the instant of the login's own invalidations (an entry made at that same instant is not kept)
        Clock.Advance(TimeSpan.FromSeconds(1));
        // Cached now, an hour ahead of the next test's clock: "active staff"
        await (await doctor.GetAsync("/api/v1/drugs")).ShouldBeOkAsync();

        // What happens between two tests of the class: the clock goes back to the real time
        await App.BeforeTestAsync(GetType());
        doctor.AccessToken = await App.Tokens.ReissueAsync(doctor, Clock.GetUtcNow());
        await Data.DeactivateStaffAsync(staff);

        await (await doctor.GetAsync("/api/v1/drugs")).ShouldBeProblemAsync(HttpStatusCode.Forbidden, "noAccess");
    }
}
