using ClinicHub.Application.Features.Catalog.Categories;
using System.Net;
using ClinicHub.Application.Features.Access;
using ClinicHub.Application.Features.Identity.Sessions;
using ClinicHub.IntegrationTests.Harness.Assertions;
using ClinicHub.IntegrationTests.Harness.Builders;
using ClinicHub.IntegrationTests.Harness.Clients;
using ClinicHub.IntegrationTests.Harness.Hosting;
using Shouldly;

namespace ClinicHub.IntegrationTests.Access;

/// <summary>
/// Changes made by the admin while a user works apply on the user's next request with the same token: the post-commit
/// cache invalidation (access § القواعد, access tech § Cache). Every test first proves the user's answer is cached, so
/// a missing invalidation fails it.
/// </summary>
[Collection(AccessCollection.Name)]
[Trait("Area", "access")]
public class AccessChangeTests(AppFixture app) : IntegrationTest(app)
{
    private static readonly string[] AssistantKeys =
    [
        "drugs.list", "drugs.details", "drugs.create", "drugs.update",
        "protocols.list", "protocols.details", "protocols.create", "protocols.update",
        "prescriptions.create",
    ];

    [Fact]
    [Trait("Case", "ACC-046")]
    public async Task Taking_drugs_create_from_the_assistant_role_applies_to_the_next_request()
    {
        var clinic = await Data.Clinic();
        var assistant = await Login.WithRoleAsync(clinic, "Assistant");
        var roleId = clinic.RoleId("Assistant");
        await CacheProofs.RoleEntryCachedAsync(App, assistant, roleId);
        var admin = await Login.SharedSuperAdminAsync();

        await SaveRoleAsync(admin, clinic, roleId, "Assistant", AssistantKeys.Where(k => k != Permissions.Drugs.Create));

        await (await assistant.PostAsync("/api/v1/drugs", new { categoryId = CategoryIds.Eye, name = "Vigamox " + Guid.NewGuid() }))
            .ShouldBeProblemAsync(HttpStatusCode.Forbidden, "forbidden");
        await (await assistant.GetAsync("/api/v1/drugs")).ShouldBeOkAsync();

        await SaveRoleAsync(admin, clinic, roleId, "Assistant", AssistantKeys);

        await (await assistant.PostAsync("/api/v1/drugs", new { categoryId = CategoryIds.Eye, name = "Vigamox " + Guid.NewGuid() })).ShouldBeAsync(HttpStatusCode.Created);
    }

    [Fact]
    [Trait("Case", "ACC-047")]
    public async Task Giving_drugs_delete_to_the_assistant_role_applies_to_the_next_request()
    {
        var clinic = await Data.Clinic();
        var drug = await Data.Drug(clinic);
        var assistant = await Login.WithRoleAsync(clinic, "Assistant");
        var roleId = clinic.RoleId("Assistant");
        await (await assistant.DeleteAsync($"/api/v1/drugs/{drug.Id}")).ShouldBeProblemAsync(HttpStatusCode.Forbidden, "forbidden");
        await CacheProofs.RoleEntryCachedAsync(App, assistant, roleId);
        var admin = await Login.SharedSuperAdminAsync();

        await SaveRoleAsync(admin, clinic, roleId, "Assistant", [.. AssistantKeys, Permissions.Drugs.Delete]);

        await (await assistant.DeleteAsync($"/api/v1/drugs/{drug.Id}")).ShouldBeAsync(HttpStatusCode.NoContent);
    }

    [Fact]
    [Trait("Case", "ACC-048")]
    public async Task Giving_and_taking_the_doctor_role_applies_to_the_next_request()
    {
        var clinic = await Data.Clinic();
        var first = await Data.Drug(clinic);
        var second = await Data.Drug(clinic);
        var staff = await Data.Staff(clinic).WithRole("Assistant");
        var user = await Login.StaffAsync(staff);
        await CacheProofs.StaffEntryCachedAsync(App, user, clinic.Id);
        var admin = await Login.SharedSuperAdminAsync();

        await SaveStaffAsync(admin, clinic, staff, true, clinic.RoleId("Assistant"), clinic.RoleId("Doctor"));

        await (await user.DeleteAsync($"/api/v1/drugs/{first.Id}")).ShouldBeAsync(HttpStatusCode.NoContent);

        await SaveStaffAsync(admin, clinic, staff, true, clinic.RoleId("Assistant"));

        await (await user.DeleteAsync($"/api/v1/drugs/{second.Id}")).ShouldBeProblemAsync(HttpStatusCode.Forbidden, "forbidden");
    }

    [Fact]
    [Trait("Tier", "Smoke")]
    [Trait("Case", "ACC-049")]
    public async Task Deactivating_locks_the_staff_member_out_at_once_and_reactivating_lets_the_same_token_in()
    {
        var clinic = await Data.Clinic();
        var staff = await Data.Staff(clinic).WithRole("Assistant");
        var user = await Login.StaffAsync(staff);
        await CacheProofs.StaffEntryCachedAsync(App, user, clinic.Id);
        var admin = await Login.SharedSuperAdminAsync();

        await SaveStaffAsync(admin, clinic, staff, false, clinic.RoleId("Assistant"));

        await (await user.GetAsync("/api/v1/drugs")).ShouldBeProblemAsync(HttpStatusCode.Forbidden, "noAccess");

        await SaveStaffAsync(admin, clinic, staff, true, clinic.RoleId("Assistant"));

        await (await user.GetAsync("/api/v1/drugs")).ShouldBeOkAsync();
    }

    [Fact]
    [Trait("Case", "ACC-050")]
    public async Task Removing_locks_the_staff_member_out_and_re_adding_lets_them_back_after_a_refresh()
    {
        var clinic = await Data.Clinic();
        var staff = await Data.Staff(clinic).WithRole("Assistant");
        var user = await Login.StaffAsync(staff);
        await CacheProofs.StaffEntryCachedAsync(App, user, clinic.Id);
        var admin = await Login.SharedSuperAdminAsync();

        await (await admin.DeleteAsync($"/api/v1/admin/clinics/{clinic.Id}/staff/{staff.Id}")).ShouldBeAsync(HttpStatusCode.NoContent);

        await (await user.GetAsync("/api/v1/drugs")).ShouldBeProblemAsync(HttpStatusCode.Forbidden, "noAccess");
        (await ContextsAsync(user)).ShouldNotContain(c => c.ClinicId == clinic.Id);

        await (await admin.PostAsync($"/api/v1/admin/clinics/{clinic.Id}/staff",
            new { phone = staff.Phone, fullName = staff.FullName, roleIds = new[] { clinic.RoleId("Assistant") } }))
            .ShouldBeAsync(HttpStatusCode.Created);
        await (await user.RefreshAsync()).ShouldBeOkAsync();

        user.Auth.Context.ShouldNotBeNull();
        user.Auth.Context.ClinicId.ShouldBe(clinic.Id);
        await (await user.GetAsync("/api/v1/drugs")).ShouldBeOkAsync();
    }

    [Fact]
    [Trait("Tier", "Smoke")]
    [Trait("Case", "ACC-051")]
    public async Task Suspending_the_clinic_locks_every_staff_member_out_at_once_and_activating_lets_them_back()
    {
        var clinic = await Data.Clinic();
        var owner = await Login.OwnerAsync(clinic);
        var assistant = await Login.WithRoleAsync(clinic, "Assistant");
        await CacheProofs.StaffEntryCachedAsync(App, owner, clinic.Id);
        await CacheProofs.StaffEntryCachedAsync(App, assistant, clinic.Id);
        var admin = await Login.SharedSuperAdminAsync();

        await (await admin.PostAsync($"/api/v1/admin/clinics/{clinic.Id}/suspend")).ShouldBeAsync(HttpStatusCode.NoContent);

        await (await owner.GetAsync("/api/v1/drugs")).ShouldBeProblemAsync(HttpStatusCode.Forbidden, "clinicSuspended");
        await (await assistant.GetAsync("/api/v1/drugs")).ShouldBeProblemAsync(HttpStatusCode.Forbidden, "clinicSuspended");

        await (await admin.PostAsync($"/api/v1/admin/clinics/{clinic.Id}/activate")).ShouldBeAsync(HttpStatusCode.NoContent);

        await (await owner.GetAsync("/api/v1/drugs")).ShouldBeOkAsync();
        await (await assistant.GetAsync("/api/v1/drugs")).ShouldBeOkAsync();
    }

    [Fact]
    [Trait("Case", "ACC-052")]
    public async Task Deleting_the_clinic_locks_its_staff_out_at_once_and_it_leaves_their_contexts()
    {
        var clinic = await Data.Clinic();
        var owner = await Login.OwnerAsync(clinic);
        await CacheProofs.StaffEntryCachedAsync(App, owner, clinic.Id);
        var admin = await Login.SharedSuperAdminAsync();

        await (await admin.DeleteAsync($"/api/v1/admin/clinics/{clinic.Id}")).ShouldBeAsync(HttpStatusCode.NoContent);

        await (await owner.GetAsync("/api/v1/drugs")).ShouldBeProblemAsync(HttpStatusCode.Forbidden, "noAccess");
        (await ContextsAsync(owner)).ShouldNotContain(c => c.ClinicId == clinic.Id);
    }

    [Fact]
    [Trait("Case", "ACC-053")]
    public async Task A_refresh_that_moves_the_session_drops_the_lost_clinics_cached_access_at_once()
    {
        var phone = Unique.Phone();
        var lost = await Data.Clinic().OwnedBy(phone);
        var kept = await Data.Clinic().OwnedBy(phone);
        var user = await Login.AsAsync(phone);
        await user.EnterClinicAsync(lost.Id);
        var lostToken = user.AccessToken;
        await (await user.GetAsync("/api/v1/drugs")).ShouldBeOkAsync();
        // Deactivated by hand: no invalidation, the cached answer still lets the token in
        await App.OutsideTheApp.ExecuteAsync("""UPDATE "Staff" SET "IsActive" = false WHERE "Id" = @p0""", lost.Owner.Id);
        await (await user.GetAsync("/api/v1/drugs")).ShouldBeOkAsync();

        await (await user.RefreshAsync()).ShouldBeOkAsync();
        user.Auth.Context.ShouldNotBeNull();
        user.Auth.Context.ClinicId.ShouldBe(kept.Id);

        user.AccessToken = lostToken;
        await (await user.GetAsync("/api/v1/drugs")).ShouldBeProblemAsync(HttpStatusCode.Forbidden, "noAccess");
    }

    private static async Task SaveRoleAsync(ApiClient admin, ClinicHandle clinic, int roleId, string name, IEnumerable<string> keys) =>
        await (await admin.PutAsync($"/api/v1/admin/clinics/{clinic.Id}/roles/{roleId}", new { name, permissions = keys.ToArray() }))
            .ShouldBeOkAsync();

    private static async Task SaveStaffAsync(ApiClient admin, ClinicHandle clinic, StaffHandle staff, bool isActive, params int[] roleIds) =>
        await (await admin.PutAsync($"/api/v1/admin/clinics/{clinic.Id}/staff/{staff.Id}",
            new { fullName = staff.FullName, isActive, roleIds })).ShouldBeOkAsync();

    private static async Task<List<ContextDto>> ContextsAsync(ApiClient client) =>
        await (await client.GetAsync("/api/v1/auth/contexts")).ReadAsync<List<ContextDto>>();
}
