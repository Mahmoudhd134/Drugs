using System.Net;
using ClinicHub.Application.Features.Access;
using ClinicHub.Application.Features.Access.Roles;
using ClinicHub.Application.Features.Prescriptions.Templates;
using ClinicHub.IntegrationTests.Harness.Assertions;
using ClinicHub.IntegrationTests.Harness.Builders;
using ClinicHub.IntegrationTests.Harness.Clients;
using ClinicHub.IntegrationTests.Harness.Hosting;
using Shouldly;
using static ClinicHub.IntegrationTests.Admin.PrescriptionTemplates.LayoutBuilder;

namespace ClinicHub.IntegrationTests.Admin.PrescriptionTemplates;

/// <summary>
/// The clinic reads its own template to print (step 2 contract § 1): <c>GET /prescription-template</c>, permission
/// <c>prescriptions.create</c>, 200 or 204; the token's clinic decides, the route takes no clinic id; 403 per the access pipeline.
/// </summary>
[Collection(AdminCollection7.Name)]
[Trait("Area", "admin")]
public class ClinicTemplateReadTests(AppFixture app) : IntegrationTest(app)
{
    private const string ClinicRoute = "/api/v1/prescription-template";

    /// <summary>A clinic whose template the super admin saved, with that layout.</summary>
    private async Task<(ClinicHandle Clinic, PrescriptionLayoutDto Layout)> ClinicWithATemplateAsync(string manualName = "الاسم")
    {
        var admin = await Login.SharedSuperAdminAsync();
        var clinic = await Data.Clinic();
        var layout = L().With(Static($"نص {manualName}"));
        await admin.SaveTemplateAsync(clinic.Id, layout);
        return (clinic, layout);
    }

    private static async Task<PrescriptionTemplateDto> ReadOwnAsync(ApiClient client)
    {
        var response = await client.GetAsync(ClinicRoute);
        await response.ShouldBeOkAsync();
        return await response.ReadAsync<PrescriptionTemplateDto>();
    }

    private static async Task ShouldHaveNoOwnTemplateAsync(ApiClient client)
    {
        var body = await (await client.GetAsync(ClinicRoute)).ShouldBeAsync(HttpStatusCode.NoContent);
        body.ShouldBeEmpty();
    }

    /// <summary>A Doctor who read the route once (the access cache is warm), then the change.</summary>
    private async Task<ApiClient> LoggedInThenAsync(Func<ClinicHandle, StaffHandle, Task> change)
    {
        var (clinic, _) = await ClinicWithATemplateAsync();
        var staff = await Data.Staff(clinic).WithRole(DefaultRoles.Doctor);
        var client = await Login.StaffAsync(staff);
        await (await client.GetAsync(ClinicRoute)).ShouldBeOkAsync();
        await change(clinic, staff);
        return client;
    }

    // ---- TPL-100: the answers ----

    [Fact]
    [Trait("Case", "TPL-100")]
    [Trait("Tier", "Smoke")]
    public async Task A_user_with_the_permission_gets_200_with_the_clinics_template()
    {
        var (clinic, layout) = await ClinicWithATemplateAsync();
        var user = await Login.WithPermissionsAsync(clinic, Permissions.Prescriptions.Create, Permissions.Drugs.List);

        var template = await ReadOwnAsync(user);

        template.Layout.ShouldMatch(layout);
    }

    [Fact]
    [Trait("Case", "TPL-100")]
    public async Task The_answer_is_the_same_template_and_date_the_super_admin_reads()
    {
        var admin = await Login.SharedSuperAdminAsync();
        var (clinic, _) = await ClinicWithATemplateAsync();
        var owner = await Login.OwnerAsync(clinic);

        var own = await ReadOwnAsync(owner);
        var asAdmin = await admin.ReadTemplateAsync(clinic.Id);

        own.Layout.ShouldMatch(asAdmin.Layout);
        own.UpdatedAt.ShouldBe(asAdmin.UpdatedAt);
    }

    [Fact]
    [Trait("Case", "TPL-100")]
    [Trait("Tier", "Smoke")]
    public async Task A_clinic_with_no_template_answers_204_with_no_body()
    {
        var user = await Login.WithPermissionsAsync(await Data.Clinic(), Permissions.Prescriptions.Create, Permissions.Drugs.List);

        await ShouldHaveNoOwnTemplateAsync(user);
    }

    [Fact]
    [Trait("Case", "TPL-100")]
    public async Task A_template_the_super_admin_deleted_answers_204()
    {
        var admin = await Login.SharedSuperAdminAsync();
        var (clinic, _) = await ClinicWithATemplateAsync();
        var owner = await Login.OwnerAsync(clinic);
        await (await owner.GetAsync(ClinicRoute)).ShouldBeOkAsync();

        await (await admin.DeleteAsync(Route(clinic.Id))).ShouldBeAsync(HttpStatusCode.NoContent);

        await ShouldHaveNoOwnTemplateAsync(owner);
    }

    [Fact]
    [Trait("Case", "TPL-100")]
    public async Task A_template_replaced_by_the_super_admin_answers_the_new_layout_at_the_next_read()
    {
        var admin = await Login.SharedSuperAdminAsync();
        var (clinic, _) = await ClinicWithATemplateAsync();
        var owner = await Login.OwnerAsync(clinic);
        await ReadOwnAsync(owner);
        var replaced = Layout(A4, Text(), Manual("السن", "m9"));

        await admin.SaveTemplateAsync(clinic.Id, replaced);

        (await ReadOwnAsync(owner)).Layout.ShouldMatch(replaced);
    }

    [Fact]
    [Trait("Case", "TPL-100")]
    public async Task No_token_gets_401()
    {
        await (await Anonymous().GetAsync(ClinicRoute)).ShouldBeProblemAsync(HttpStatusCode.Unauthorized, "unauthorized");
    }

    // ---- TPL-101: who may not ----

    [Fact]
    [Trait("Case", "TPL-101")]
    [Trait("Tier", "Smoke")]
    public async Task A_user_without_the_permission_gets_403_forbidden_even_when_the_clinic_has_a_template()
    {
        var (clinic, _) = await ClinicWithATemplateAsync();
        var user = await Login.WithPermissionsAsync(clinic, Permissions.Drugs.List, Permissions.Protocols.List);

        await (await user.GetAsync(ClinicRoute)).ShouldBeProblemAsync(HttpStatusCode.Forbidden, "forbidden");
    }

    [Fact]
    [Trait("Case", "TPL-101")]
    [Trait("Tier", "Smoke")]
    public async Task A_platform_token_gets_403_forbidden()
    {
        var admin = await Login.SharedSuperAdminAsync();

        await (await admin.GetAsync(ClinicRoute)).ShouldBeProblemAsync(HttpStatusCode.Forbidden, "forbidden");
    }

    // ---- TPL-102: the token's clinic decides ----

    [Fact]
    [Trait("Case", "TPL-102")]
    [Trait("Tier", "Smoke")]
    public async Task Each_clinics_user_reads_only_that_clinics_template()
    {
        var (clinicA, layoutA) = await ClinicWithATemplateAsync("أ");
        var (clinicB, layoutB) = await ClinicWithATemplateAsync("ب");
        var userA = await Login.OwnerAsync(clinicA);
        var userB = await Login.OwnerAsync(clinicB);

        (await ReadOwnAsync(userA)).Layout.ShouldMatch(layoutA);
        (await ReadOwnAsync(userB)).Layout.ShouldMatch(layoutB);
    }

    [Fact]
    [Trait("Case", "TPL-102")]
    public async Task A_clinic_with_none_answers_204_when_another_clinic_has_a_template()
    {
        await ClinicWithATemplateAsync();
        var userB = await Login.OwnerAsync(await Data.Clinic());

        await ShouldHaveNoOwnTemplateAsync(userB);
    }

    [Fact]
    [Trait("Case", "TPL-102")]
    public async Task A_clinic_id_in_the_query_is_ignored()
    {
        var (clinicA, _) = await ClinicWithATemplateAsync("أ");
        var (clinicB, layoutB) = await ClinicWithATemplateAsync("ب");
        var userB = await Login.OwnerAsync(clinicB);
        var userWithNone = await Login.OwnerAsync(await Data.Clinic());

        var response = await userB.GetAsync($"{ClinicRoute}?clinicId={clinicA.Id}");
        await response.ShouldBeOkAsync();
        (await response.ReadAsync<PrescriptionTemplateDto>()).Layout.ShouldMatch(layoutB);

        (await (await userWithNone.GetAsync($"{ClinicRoute}?clinicId={clinicA.Id}")).ShouldBeAsync(HttpStatusCode.NoContent)).ShouldBeEmpty();
    }

    [Fact]
    [Trait("Case", "TPL-102")]
    public async Task A_clinic_id_in_the_path_is_no_route()
    {
        var (clinicA, _) = await ClinicWithATemplateAsync();
        var userB = await Login.OwnerAsync(await Data.Clinic());

        await (await userB.GetAsync($"{ClinicRoute}/{clinicA.Id}")).ShouldBeAsync(HttpStatusCode.NotFound);
    }

    [Fact]
    [Trait("Case", "TPL-102")]
    public async Task One_user_in_two_clinics_reads_the_template_of_the_context_they_are_in()
    {
        var phone = Unique.Phone();
        var admin = await Login.SharedSuperAdminAsync();
        var clinicA = await Data.Clinic().OwnedBy(phone);
        var clinicB = await Data.Clinic().OwnedBy(phone);
        var layoutA = L();
        await admin.SaveTemplateAsync(clinicA.Id, layoutA);
        var user = await Login.AsAsync(phone);

        await user.EnterClinicAsync(clinicA.Id);
        (await ReadOwnAsync(user)).Layout.ShouldMatch(layoutA);

        await user.EnterClinicAsync(clinicB.Id);
        await ShouldHaveNoOwnTemplateAsync(user);
    }

    // ---- TPL-300: the access pipeline ----

    [Fact]
    [Trait("Case", "TPL-300")]
    public async Task A_no_context_token_gets_403_forbidden()
    {
        var phone = Unique.Phone();
        await Data.Clinic().OwnedBy(phone);
        await Data.Clinic().OwnedBy(phone);
        var user = await Login.AsAsync(phone);
        user.Auth.Context.ShouldBeNull("two clinics: no context before picking one");

        await (await user.GetAsync(ClinicRoute)).ShouldBeProblemAsync(HttpStatusCode.Forbidden, "forbidden");
    }

    [Fact]
    [Trait("Case", "TPL-300")]
    public async Task A_deactivated_staff_member_gets_403_noAccess()
    {
        var user = await LoggedInThenAsync((_, staff) => Data.DeactivateStaffAsync(staff));

        await (await user.GetAsync(ClinicRoute)).ShouldBeProblemAsync(HttpStatusCode.Forbidden, "noAccess");
    }

    [Fact]
    [Trait("Case", "TPL-300")]
    public async Task A_removed_staff_member_gets_403_noAccess()
    {
        var user = await LoggedInThenAsync((_, staff) => Data.RemoveStaffAsync(staff));

        await (await user.GetAsync(ClinicRoute)).ShouldBeProblemAsync(HttpStatusCode.Forbidden, "noAccess");
    }

    [Fact]
    [Trait("Case", "TPL-300")]
    public async Task Staff_of_a_suspended_clinic_get_403_clinicSuspended()
    {
        var user = await LoggedInThenAsync((clinic, _) => Data.SuspendClinicAsync(clinic));

        await (await user.GetAsync(ClinicRoute)).ShouldBeProblemAsync(HttpStatusCode.Forbidden, "clinicSuspended");
    }

    [Fact]
    [Trait("Case", "TPL-300")]
    public async Task Staff_of_a_deleted_clinic_get_403_noAccess()
    {
        var user = await LoggedInThenAsync((clinic, _) => Data.DeleteClinicAsync(clinic));

        await (await user.GetAsync(ClinicRoute)).ShouldBeProblemAsync(HttpStatusCode.Forbidden, "noAccess");
    }

    [Fact]
    [Trait("Case", "TPL-300")]
    public async Task A_role_with_only_the_drug_list_gets_403_forbidden()
    {
        var (clinic, _) = await ClinicWithATemplateAsync();
        var user = await Login.WithPermissionsAsync(clinic, Permissions.Drugs.List);

        await (await user.GetAsync(ClinicRoute)).ShouldBeProblemAsync(HttpStatusCode.Forbidden, "forbidden");
    }

    // ---- TPL-301: the template clinic ----

    [Fact]
    [Trait("Case", "TPL-301")]
    public async Task The_super_admin_in_the_template_clinics_context_gets_204()
    {
        var inTemplate = await Login.SuperAdminInTemplateAsync();

        await ShouldHaveNoOwnTemplateAsync(inTemplate);
        (await App.TemplateRowsAsync(await App.TemplateClinicIdAsync())).ShouldBeEmpty();
    }
}
