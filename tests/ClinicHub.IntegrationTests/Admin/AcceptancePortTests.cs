using System.Net;
using ClinicHub.Application.Features.Access.Roles;
using ClinicHub.Application.Features.Catalog.Protocols;
using ClinicHub.Application.Features.Catalog.Drugs;
using ClinicHub.Application.Features.Identity.Sessions;
using ClinicHub.IntegrationTests.Harness.Assertions;
using ClinicHub.IntegrationTests.Harness.Builders;
using ClinicHub.IntegrationTests.Harness.Clients;
using ClinicHub.IntegrationTests.Harness.Hosting;
using Shouldly;

namespace ClinicHub.IntegrationTests.Admin;

/// <summary>
/// Ported from the M1.5 acceptance matrix (accept-api.py "lockout"): an admin change applies to the staff's next
/// request, the cache warmed by a request first (platform-admin tech "Role and staff invalidations" and "Lockout is on
/// the next request"; access business "القواعد التشغيلية"). The ACC/AUTH cases of these rules belong to other tracks:
/// these tests carry no case ID.
/// </summary>
[Collection(AdminCollection.Name)]
[Trait("Area", "admin")]
public class LockoutAfterAdminChangeTests(AppFixture app) : IntegrationTest(app)
{
    private static object NewDrug() => new { name = Unique.Name("Drug", "دواء"), description = "", defaultDosing = Dosings.Drops() };

    private async Task<(ClinicHandle Clinic, ApiClient Admin, RoleDto Writers, StaffHandle Staff, ApiClient Browser)> WarmStaffAsync()
    {
        var admin = await Login.SharedSuperAdminAsync();
        var clinic = await Data.Clinic();
        var writers = await admin.CreateRoleAsync(clinic.Id, "Writers", "drugs.list", "drugs.create");
        var staffMember = await admin.AddedStaffAsync(clinic.Id, Unique.Phone(), "Locked Staff", writers.Id);
        var staff = new StaffHandle(staffMember.Id, staffMember.UserId, clinic.Id, staffMember.Phone, staffMember.FullName);
        var browser = await Login.StaffAsync(staff);
        await (await browser.GetAsync("/api/v1/drugs")).ShouldBeOkAsync();
        await (await browser.PostAsync("/api/v1/drugs", NewDrug())).ShouldBeAsync(HttpStatusCode.Created);
        return (clinic, admin, writers, staff, browser);
    }

    private static async Task<List<ContextDto>> ContextsAsync(ApiClient browser) =>
        await (await browser.GetAsync("/api/v1/auth/contexts")).ReadAsync<List<ContextDto>>();

    [Fact]
    public async Task A_permission_taken_from_the_role_is_refused_at_the_next_request_and_given_back_works_again()
    {
        var (clinic, admin, writers, _, browser) = await WarmStaffAsync();

        await admin.UpdateRoleAsync(clinic.Id, writers.Id, "Writers", "drugs.list");

        await (await browser.PostAsync("/api/v1/drugs", NewDrug())).ShouldBeProblemAsync(HttpStatusCode.Forbidden, "forbidden");
        await (await browser.GetAsync("/api/v1/drugs")).ShouldBeOkAsync();
        (await browser.MeAsync()).Permissions.ShouldBe(["drugs.list"]);
        await admin.UpdateRoleAsync(clinic.Id, writers.Id, "Writers", "drugs.list", "drugs.create");
        await (await browser.PostAsync("/api/v1/drugs", NewDrug())).ShouldBeAsync(HttpStatusCode.Created);
    }

    [Fact]
    public async Task Replaced_staff_roles_apply_at_the_next_request_and_a_role_rename_keeps_access()
    {
        var (clinic, admin, writers, staff, browser) = await WarmStaffAsync();
        var readers = await admin.CreateRoleAsync(clinic.Id, "Readers", "drugs.list");

        await (await admin.UpdateStaffAsync(clinic.Id, staff.Id, staff.FullName, true, readers.Id)).ShouldBeOkAsync();
        await (await browser.PostAsync("/api/v1/drugs", NewDrug())).ShouldBeProblemAsync(HttpStatusCode.Forbidden, "forbidden");
        await (await admin.UpdateStaffAsync(clinic.Id, staff.Id, staff.FullName, true, writers.Id)).ShouldBeOkAsync();
        await (await browser.PostAsync("/api/v1/drugs", NewDrug())).ShouldBeAsync(HttpStatusCode.Created);

        await admin.UpdateRoleAsync(clinic.Id, writers.Id, "Writers renamed", "drugs.list", "drugs.create");
        await (await browser.GetAsync("/api/v1/drugs")).ShouldBeOkAsync();
        await (await browser.PostAsync("/api/v1/drugs", NewDrug())).ShouldBeAsync(HttpStatusCode.Created);
    }

    [Fact]
    public async Task A_deactivated_staff_member_loses_the_clinic_at_the_next_request_and_gets_it_back_with_the_same_token()
    {
        var (clinic, admin, writers, staff, browser) = await WarmStaffAsync();

        await (await admin.UpdateStaffAsync(clinic.Id, staff.Id, staff.FullName, false, writers.Id)).ShouldBeOkAsync();

        await (await browser.GetAsync("/api/v1/drugs")).ShouldBeProblemAsync(HttpStatusCode.Forbidden, "noAccess");
        (await ContextsAsync(browser)).ShouldBeEmpty();
        await (await admin.UpdateStaffAsync(clinic.Id, staff.Id, staff.FullName, true, writers.Id)).ShouldBeOkAsync();
        await (await browser.GetAsync("/api/v1/drugs")).ShouldBeOkAsync();
    }

    [Fact]
    public async Task A_suspended_clinic_refuses_its_staff_and_owner_at_the_next_request_until_it_is_activated()
    {
        var (clinic, admin, _, _, browser) = await WarmStaffAsync();
        var owner = await Login.OwnerAsync(clinic);
        await (await owner.GetAsync("/api/v1/drugs")).ShouldBeOkAsync();

        await (await admin.PostAsync(AdminRoutes.Suspend(clinic.Id))).ShouldBeAsync(HttpStatusCode.NoContent);

        await (await browser.GetAsync("/api/v1/drugs")).ShouldBeProblemAsync(HttpStatusCode.Forbidden, "clinicSuspended");
        await (await owner.GetAsync("/api/v1/drugs")).ShouldBeProblemAsync(HttpStatusCode.Forbidden, "clinicSuspended");
        await (await browser.SwitchContextAsync("clinic", clinic.Id)).ShouldBeProblemAsync(HttpStatusCode.Forbidden, "clinicSuspended");
        await (await admin.PostAsync(AdminRoutes.Activate(clinic.Id))).ShouldBeAsync(HttpStatusCode.NoContent);
        await (await browser.GetAsync("/api/v1/drugs")).ShouldBeOkAsync();
        await (await owner.GetAsync("/api/v1/drugs")).ShouldBeOkAsync();
    }

    [Fact]
    public async Task A_removed_staff_member_with_no_clinic_left_loses_access_and_the_session_at_the_next_refresh()
    {
        var (clinic, admin, _, staff, browser) = await WarmStaffAsync();

        await (await admin.DeleteAsync(AdminRoutes.StaffMember(clinic.Id, staff.Id))).ShouldBeAsync(HttpStatusCode.NoContent);

        await (await browser.GetAsync("/api/v1/drugs")).ShouldBeProblemAsync(HttpStatusCode.Forbidden, "noAccess");
        (await ContextsAsync(browser)).ShouldBeEmpty();
        await (await browser.RefreshAsync()).ShouldBeProblemAsync(HttpStatusCode.Unauthorized, "noContexts");
        (await browser.RefreshAsync()).StatusCode.ShouldBe(HttpStatusCode.Unauthorized);
    }

    [Fact]
    public async Task The_owner_of_a_deleted_clinic_loses_it_at_the_next_request_and_can_no_longer_log_in()
    {
        var admin = await Login.SharedSuperAdminAsync();
        var clinic = await Data.Clinic();
        var owner = await Login.OwnerAsync(clinic);
        await (await owner.GetAsync("/api/v1/drugs")).ShouldBeOkAsync();

        await (await admin.DeleteAsync(AdminRoutes.Clinic(clinic.Id))).ShouldBeAsync(HttpStatusCode.NoContent);

        await (await owner.GetAsync("/api/v1/drugs")).ShouldBeProblemAsync(HttpStatusCode.Forbidden, "noAccess");
        (await ContextsAsync(owner)).ShouldBeEmpty();
        await (await owner.RefreshAsync()).ShouldBeProblemAsync(HttpStatusCode.Unauthorized, "noContexts");
        await (await Login.TryAsync(Anonymous(), clinic.Owner.Phone)).ShouldBeProblemAsync(HttpStatusCode.Forbidden, "noAccess");
    }

    [Fact]
    public async Task With_one_clinic_left_the_refresh_moves_the_session_to_it()
    {
        var admin = await Login.SharedSuperAdminAsync();
        var phone = Unique.Phone();
        var m1 = await Data.Clinic().OwnedBy(phone);
        var m2 = await Data.Clinic().OwnedBy(phone);
        var browser = await Login.AsAsync(phone);
        browser.Auth.Context.ShouldBeNull();
        browser.Auth.Contexts.Count.ShouldBe(2);
        await browser.EnterClinicAsync(m1.Id);
        await (await browser.GetAsync("/api/v1/drugs")).ShouldBeOkAsync();

        await (await admin.DeleteAsync(AdminRoutes.Clinic(m1.Id))).ShouldBeAsync(HttpStatusCode.NoContent);

        await (await browser.GetAsync("/api/v1/drugs")).ShouldBeProblemAsync(HttpStatusCode.Forbidden, "noAccess");
        await (await browser.RefreshAsync()).ShouldBeOkAsync();
        browser.Auth.Context.ShouldNotBeNull();
        browser.Auth.Context.ClinicId.ShouldBe(m2.Id);
        await (await browser.GetAsync("/api/v1/drugs")).ShouldBeOkAsync();
    }

    [Fact]
    public async Task With_two_clinics_left_the_refresh_clears_the_context()
    {
        var admin = await Login.SharedSuperAdminAsync();
        var phone = Unique.Phone();
        var n0 = await Data.Clinic().OwnedBy(phone);
        var n1 = await Data.Clinic().OwnedBy(phone);
        var n2 = await Data.Clinic().OwnedBy(phone);
        var browser = await Login.AsAsync(phone);
        await browser.EnterClinicAsync(n0.Id);
        await (await browser.GetAsync("/api/v1/drugs")).ShouldBeOkAsync();

        await (await admin.DeleteAsync(AdminRoutes.Clinic(n0.Id))).ShouldBeAsync(HttpStatusCode.NoContent);

        await (await browser.RefreshAsync()).ShouldBeOkAsync();
        browser.Auth.Context.ShouldBeNull();
        browser.Auth.Contexts.Select(c => c.ClinicId).ShouldBe([n1.Id, n2.Id], ignoreOrder: true);
    }

    [Fact]
    public async Task With_its_clinic_suspended_and_one_other_left_the_refresh_moves_the_session()
    {
        var admin = await Login.SharedSuperAdminAsync();
        var phone = Unique.Phone();
        var n1 = await Data.Clinic().OwnedBy(phone);
        var n2 = await Data.Clinic().OwnedBy(phone);
        var browser = await Login.AsAsync(phone);
        await browser.EnterClinicAsync(n1.Id);
        await (await browser.GetAsync("/api/v1/drugs")).ShouldBeOkAsync();

        await (await admin.PostAsync(AdminRoutes.Suspend(n1.Id))).ShouldBeAsync(HttpStatusCode.NoContent);

        await (await browser.RefreshAsync()).ShouldBeOkAsync();
        browser.Auth.Context.ShouldNotBeNull();
        browser.Auth.Context.ClinicId.ShouldBe(n2.Id);
    }
}

/// <summary>
/// Ported from the M1.5 acceptance runs (accept-api.py "misc" and accept-reg-api.py "cap" / "perms"): catalog limits,
/// control characters and the default roles' rights, through the API (protocols tech "Validators", drugs tech "API",
/// access business "الأدوار"). Their catalog and access cases belong to other tracks: these tests carry no case ID.
/// </summary>
[Collection(AdminCollection2.Name)]
[Trait("Area", "admin")]
public class CatalogRegressionPortTests(AppFixture app) : IntegrationTest(app)
{
    private async Task<(ClinicHandle Clinic, ApiClient Owner)> ClinicFromTemplateAsync()
    {
        await App.PerClassAsync("template", () => TemplateCatalog.CreateAsync(App));
        var clinic = await Data.Clinic();
        return (clinic, await Login.OwnerAsync(clinic));
    }

    [Fact]
    public async Task A_protocol_of_more_than_1000_lines_is_refused_with_one_invalidRequest_error()
    {
        var (_, owner) = await ClinicFromTemplateAsync();
        var drug = (await owner.DrugsAsync()).Items[0];

        var problem = await (await owner.PostAsync("/api/v1/protocols",
                new { name = "Too big", items = Enumerable.Repeat(new { drugId = drug.Id, dosing = (object)null }, 1001) }))
            .ShouldBeProblemAsync(HttpStatusCode.BadRequest, "invalidRequest");

        problem.Errors.Count.ShouldBe(1);
    }

    [Fact]
    public async Task A_protocol_of_exactly_1000_distinct_drugs_is_saved_and_1001_are_refused()
    {
        var clinic = await Data.Clinic();
        var owner = await Login.OwnerAsync(clinic);
        var ids = new List<int>();
        for (var batch = 0; batch < 1001; batch += 50)
            ids.AddRange((await Task.WhenAll(Enumerable.Range(batch, Math.Min(50, 1001 - batch))
                .Select(async i => (await Data.Drug(clinic).Named($"Drug number {i:D4}")).Id))).ToList());
        var items = ids.Select(id => new { drugId = id, dosing = (object)null }).ToList();

        await (await owner.PostAsync("/api/v1/protocols", new { name = "Too big", items }))
            .ShouldBeProblemAsync(HttpStatusCode.BadRequest, "invalidRequest");
        var created = await owner.PostAsync("/api/v1/protocols", new { name = "Exactly 1000", items = items.Take(1000) });
        await created.ShouldBeAsync(HttpStatusCode.Created);
        var protocol = await created.ReadAsync<ProtocolDto>();
        protocol.Items.Count.ShouldBe(1000);
        await (await owner.PutAsync($"/api/v1/protocols/{protocol.Id}", new { name = "Exactly 1000", items }))
            .ShouldBeProblemAsync(HttpStatusCode.BadRequest, "invalidRequest");
        await (await owner.DeleteAsync($"/api/v1/protocols/{protocol.Id}")).ShouldBeAsync(HttpStatusCode.NoContent);
    }

    [Fact]
    public async Task Duplicate_lines_unknown_drugs_and_an_empty_protocol_are_refused()
    {
        var (_, owner) = await ClinicFromTemplateAsync();
        var drug = (await owner.DrugsAsync()).Items[0];

        await (await owner.PostAsync("/api/v1/protocols",
                new { name = "Dup", items = new[] { new { drugId = drug.Id, dosing = (object)null }, new { drugId = drug.Id, dosing = (object)null } } }))
            .ShouldBeProblemAsync(HttpStatusCode.BadRequest, "duplicateProtocolItem");
        await (await owner.PostAsync("/api/v1/protocols", new { name = "Unknown", items = new[] { new { drugId = 99_999_999, dosing = (object)null } } }))
            .ShouldBeProblemAsync(HttpStatusCode.BadRequest, "drugNotFound");
        (await (await owner.PostAsync("/api/v1/protocols", new { name = "  ", items = Array.Empty<object>() }))
            .ShouldBeProblemAsync(HttpStatusCode.BadRequest, "nameRequired")).Codes.ShouldBe(["nameRequired", "drugsRequired"]);
    }

    [Fact]
    public async Task A_NUL_in_a_drug_description_is_refused_while_line_breaks_and_tabs_are_kept()
    {
        var (_, owner) = await ClinicFromTemplateAsync();
        var drug = (await owner.DrugsAsync()).Items[0];

        (await (await owner.PostAsync("/api/v1/drugs", new { name = "NUL desc", description = "x\u0000y", defaultDosing = drug.DefaultDosing }))
            .ShouldBeProblemAsync(HttpStatusCode.BadRequest, "invalidText")).Errors.Select(e => (e.Code, e.Field)).ShouldBe([("invalidText", "description")]);
        await (await owner.PutAsync($"/api/v1/drugs/{drug.Id}", new { name = drug.Name, description = "x\u0000y", defaultDosing = drug.DefaultDosing }))
            .ShouldBeProblemAsync(HttpStatusCode.BadRequest, "invalidText");
        var kept = await owner.PostAsync("/api/v1/drugs", new { name = Unique.Name("Desc ok", "وصف"), description = "line1\nline2\tx", defaultDosing = drug.DefaultDosing });
        await kept.ShouldBeAsync(HttpStatusCode.Created);
        (await kept.ReadAsync<DrugDto>()).Description.ShouldBe("line1\nline2\tx");
    }

    [Fact]
    public async Task A_NUL_in_a_catalog_search_is_dropped()
    {
        var (_, owner) = await ClinicFromTemplateAsync();

        foreach (var url in new[] { "/api/v1/drugs?search=%00", "/api/v1/protocols?search=%00", "/api/v1/drugs?search=x%00y" })
            await (await owner.GetAsync(url)).ShouldBeOkAsync();
        var all = await (await owner.GetAsync("/api/v1/drugs")).ReadAsync<ClinicHub.Application.Common.Paging.PagedResult<DrugDto>>();
        (await (await owner.GetAsync("/api/v1/drugs?search=%00")).ReadAsync<ClinicHub.Application.Common.Paging.PagedResult<DrugDto>>())
            .TotalCount.ShouldBe(all.TotalCount);
    }

    [Fact]
    public async Task The_assistant_has_no_delete_rights()
    {
        var (clinic, owner) = await ClinicFromTemplateAsync();
        var assistant = await Login.WithRoleAsync(clinic, DefaultRoles.Assistant);
        var drug = (await owner.DrugsAsync()).Items[0];
        var protocol = (await owner.ProtocolsAsync())[0];

        var permissions = (await assistant.MeAsync()).Permissions;
        permissions.ShouldNotContain("drugs.delete");
        permissions.ShouldNotContain("protocols.delete");
        await (await assistant.DeleteAsync($"/api/v1/drugs/{drug.Id}")).ShouldBeProblemAsync(HttpStatusCode.Forbidden, "forbidden");
        await (await assistant.DeleteAsync($"/api/v1/protocols/{protocol.Id}")).ShouldBeProblemAsync(HttpStatusCode.Forbidden, "forbidden");
    }

    [Fact]
    public async Task A_read_only_role_lists_the_template_copy_and_cannot_add_a_drug()
    {
        var (clinic, _) = await ClinicFromTemplateAsync();
        var viewer = await Login.WithPermissionsAsync(clinic, "drugs.list", "drugs.details", "protocols.list", "protocols.details");

        (await viewer.MeAsync()).Permissions.ShouldBe(["drugs.list", "drugs.details", "protocols.list", "protocols.details"], ignoreOrder: true);
        (await viewer.PostAsync("/api/v1/drugs", new { name = "x", description = (string)null, defaultDosing = (object)null })).StatusCode
            .ShouldBe(HttpStatusCode.Forbidden);
        (await viewer.DrugsAsync()).TotalCount.ShouldBe(2);
    }
}
