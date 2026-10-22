using System.Net;
using ClinicHub.Application.Features.Access.Roles;
using ClinicHub.Application.Features.Identity.Sessions;
using ClinicHub.Application.Features.Platform.Clinics;
using ClinicHub.IntegrationTests.Harness.Assertions;
using ClinicHub.IntegrationTests.Harness.Builders;
using ClinicHub.IntegrationTests.Harness.Clients;
using ClinicHub.IntegrationTests.Harness.Hosting;
using Microsoft.EntityFrameworkCore;
using Shouldly;

namespace ClinicHub.IntegrationTests.Admin;

/// <summary>
/// A clinic's details and rename (platform-admin tech "API": <c>owners</c> = active staff holding the Owner role, by
/// name; rename with the name rules; names need not be unique).
/// </summary>
[Collection(AdminCollection4.Name)]
[Trait("Area", "admin")]
public class ClinicDetailsAndRenameTests(AppFixture app) : IntegrationTest(app)
{
    private static async Task<Problem> RenameRefusedAsync(ApiClient admin, int id, object body, string code) =>
        await (await admin.PutAsync(AdminRoutes.Clinic(id), body)).ShouldBeProblemAsync(HttpStatusCode.BadRequest, code);

    private static async Task<ClinicDetails> RenamedAsync(ApiClient admin, int id, string name)
    {
        var response = await admin.PutAsync(AdminRoutes.Clinic(id), new { name });
        await response.ShouldBeOkAsync();
        return await response.ReadAsync<ClinicDetails>();
    }

    [Fact]
    [Trait("Case", "ADM-090")]
    public async Task The_owners_are_the_active_Owner_holders_by_name_with_E164_phones()
    {
        var admin = await Login.SharedSuperAdminAsync();
        var a = await Data.Clinic().OwnedBy("01000000071", "Zed Owner");
        var p = await Data.Staff(a).Named("Inactive Owner").WithRole(DefaultRoles.Owner).Inactive();
        var q = await Data.Staff(a).Named("Adam Owner").WithRole(DefaultRoles.Owner);
        await Data.Staff(a).Named("Aaron Doctor").WithRole(DefaultRoles.Doctor);

        var response = await admin.GetAsync(AdminRoutes.Clinic(a.Id));

        await response.ShouldBeOkAsync();
        var details = await response.ReadAsync<ClinicDetails>();
        details.Owners.Select(o => (o.StaffId, o.FullName, o.Phone)).ShouldBe(
            [(q.Id, "Adam Owner", q.Phone), (a.Owner.Id, "Zed Owner", "+201000000071")]);
        details.Owners.ShouldNotContain(o => o.StaffId == p.Id);
        var node = (await response.ReadNodeAsync()).AsObject();
        node.Select(x => x.Key).OrderBy(k => k).ShouldBe(["createdAt", "id", "name", "owners", "staffCount", "status"]);
        node["owners"]![0]!.AsObject().Select(x => x.Key).OrderBy(k => k).ShouldBe(["fullName", "phone", "staffId"]);
    }

    [Fact]
    [Trait("Case", "ADM-101")]
    [Trait("Tier", "Smoke")]
    public async Task A_rename_answers_the_clinic_details_with_the_trimmed_name()
    {
        var admin = await Login.SharedSuperAdminAsync();
        var a = await Data.Clinic();

        var renamed = await RenamedAsync(admin, a.Id, "  New name  ");

        renamed.Id.ShouldBe(a.Id);
        renamed.Name.ShouldBe("New name");
        renamed.Status.ShouldBe("active");
        renamed.StaffCount.ShouldBe(1);
        renamed.Owners.ShouldHaveSingleItem().StaffId.ShouldBe(a.Owner.Id);
    }

    [Fact]
    [Trait("Case", "ADM-102")]
    public async Task A_rename_follows_the_name_rules()
    {
        var admin = await Login.SharedSuperAdminAsync();
        var a = await Data.Clinic();
        var name256 = $"{Unique.Next()} ".PadRight(256, 'r');

        (await RenameRefusedAsync(admin, a.Id, new { name = "  " }, "nameRequired")).ShouldHaveError("name", "nameRequired");
        (await RenamedAsync(admin, a.Id, name256)).Name.ShouldBe(name256);
        (await RenameRefusedAsync(admin, a.Id, new { name = name256 + "r" }, "nameTooLong")).ShouldHaveError("name", "nameTooLong");
        (await RenameRefusedAsync(admin, a.Id, new { name = "Bad\u202Ename" }, "nameInvalid")).ShouldHaveError("name", "nameInvalid");
        (await admin.ClinicAsync(a.Id)).Name.ShouldBe(name256);
    }

    [Theory]
    [InlineData("", "nameRequired")]
    [InlineData(null, "nameRequired")]
    [InlineData("\u200B", "nameRequired")]
    [InlineData("\u200B \u2060\uFEFF", "nameRequired")]
    [InlineData("\u200E", "nameRequired")]
    [InlineData("  \t ", "nameRequired")]
    [InlineData("a\u0000b", "nameInvalid")]
    [InlineData("a\u2028b", "nameInvalid")]
    [InlineData("a\u2029b", "nameInvalid")]
    [InlineData("a\u202Ab", "nameInvalid")]
    [InlineData("a\u2066b\u2069", "nameInvalid")]
    [InlineData("a\nb", "nameInvalid")]
    public async Task A_rename_refuses_blank_and_invalid_names_on_name(string name, string code)
    {
        // Ported from accept-api.py "clinics get/rename"
        var admin = await Login.SharedSuperAdminAsync();
        var a = await Data.Clinic();

        var problem = await RenameRefusedAsync(admin, a.Id, new { name }, code);

        problem.Errors.Select(e => (e.Code, e.Field)).ShouldBe([(code, "name")]);
        (await admin.ClinicAsync(a.Id)).Name.ShouldBe(a.Name);
    }

    [Fact]
    public async Task A_rename_without_a_name_or_with_malformed_JSON_is_refused()
    {
        // Ported from accept-api.py "clinics get/rename"
        var admin = await Login.SharedSuperAdminAsync();
        var a = await Data.Clinic();

        await RenameRefusedAsync(admin, a.Id, new { }, "nameRequired");
        await (await admin.SendRawAsync(HttpMethod.Put, AdminRoutes.Clinic(a.Id), "{bad json"))
            .ShouldBeProblemAsync(HttpStatusCode.BadRequest, "invalidRequest");
        (await admin.ClinicAsync(a.Id)).Name.ShouldBe(a.Name);
    }

    [Theory]
    [InlineData("a\u200Eb")]
    [InlineData("a\u200Fb")]
    [InlineData("a\u061Cb")]
    [InlineData("a\u200Db")]
    [InlineData("a\u200Cb")]
    [InlineData("عيادة النور")]
    public async Task A_rename_keeps_direction_marks_joiners_and_Arabic_as_typed(string name)
    {
        // Ported from accept-api.py "clinics get/rename"
        var admin = await Login.SharedSuperAdminAsync();
        var a = await Data.Clinic();

        (await RenamedAsync(admin, a.Id, name)).Name.ShouldBe(name);
    }

    [Fact]
    [Trait("Case", "ADM-103")]
    public async Task A_clinic_can_be_renamed_to_another_clinics_name()
    {
        var admin = await Login.SharedSuperAdminAsync();
        var a = await Data.Clinic();
        var b = await Data.Clinic();

        (await RenamedAsync(admin, a.Id, b.Name)).Name.ShouldBe(b.Name);
    }

    [Fact]
    [Trait("Case", "ADM-104")]
    public async Task A_suspended_clinic_can_be_renamed()
    {
        var admin = await Login.SharedSuperAdminAsync();
        var a = await Data.Clinic().Suspended();

        var renamed = await RenamedAsync(admin, a.Id, $"Renamed {Unique.Next()}");

        renamed.Status.ShouldBe("suspended");
    }

    [Fact]
    [Trait("Case", "ADM-105")]
    public async Task A_new_name_shows_at_once_in_the_list_the_details_and_the_staffs_contexts()
    {
        var admin = await Login.SharedSuperAdminAsync();
        var a = await Data.Clinic();
        var staff = await Data.Staff(a);
        var browser = await Login.StaffAsync(staff);
        (await browser.GetAsync("/api/v1/auth/contexts")).StatusCode.ShouldBe(HttpStatusCode.OK);
        var name = $"Fresh name {Unique.Next()}";

        await RenamedAsync(admin, a.Id, name);

        (await admin.ListClinicsAsync($"search={Uri.EscapeDataString(name)}")).Items.ShouldHaveSingleItem().Id.ShouldBe(a.Id);
        (await admin.ClinicAsync(a.Id)).Name.ShouldBe(name);
        var contexts = await (await browser.GetAsync("/api/v1/auth/contexts")).ReadAsync<List<ContextDto>>();
        contexts.Single(c => c.ClinicId == a.Id).ClinicName.ShouldBe(name);
    }
}

/// <summary>
/// Suspend and activate (business "القواعد التشغيلية": data kept, repeating changes nothing; a suspended clinic's roles
/// and staff are still managed; tech: 204, idempotent).
/// </summary>
[Collection(AdminCollection4.Name)]
[Trait("Area", "admin")]
public class SuspendAndActivateTests(AppFixture app) : IntegrationTest(app)
{
    [Fact]
    [Trait("Case", "ADM-111")]
    [Trait("Tier", "Smoke")]
    public async Task Suspend_answers_204_and_the_clinic_is_suspended_in_the_details_and_the_list()
    {
        var admin = await Login.SharedSuperAdminAsync();
        var a = await Data.Clinic();

        await (await admin.PostAsync(AdminRoutes.Suspend(a.Id))).ShouldBeAsync(HttpStatusCode.NoContent);

        (await admin.ClinicAsync(a.Id)).Status.ShouldBe("suspended");
        (await admin.ListClinicsAsync($"search={Uri.EscapeDataString(a.Name)}")).Items.Single().Status.ShouldBe("suspended");
        (await admin.SearchClinicIdsAsync(a.Name, "&status=suspended")).ShouldBe([a.Id]);
        (await admin.SearchClinicIdsAsync(a.Name, "&status=active")).ShouldBeEmpty();
    }

    [Fact]
    [Trait("Case", "ADM-112")]
    public async Task Suspending_a_suspended_clinic_answers_204_and_changes_nothing()
    {
        var admin = await Login.SharedSuperAdminAsync();
        var a = await Data.Clinic().Suspended();
        var before = await admin.ClinicAsync(a.Id);
        var row = await App.QueryDbAsync(db => db.Clinics.AsNoTracking().SingleAsync(c => c.Id == a.Id));

        Clock.Advance(TimeSpan.FromMinutes(1));
        await (await admin.PostAsync(AdminRoutes.Suspend(a.Id))).ShouldBeAsync(HttpStatusCode.NoContent);

        (await admin.ClinicAsync(a.Id)).ShouldBeEquivalentTo(before);
        (await App.QueryDbAsync(db => db.Clinics.AsNoTracking().SingleAsync(c => c.Id == a.Id))).UpdatedAt.ShouldBe(row.UpdatedAt);
    }

    [Fact]
    [Trait("Case", "ADM-113")]
    public async Task Activating_twice_answers_204_twice_and_the_clinic_is_active()
    {
        var admin = await Login.SharedSuperAdminAsync();
        var a = await Data.Clinic().Suspended();

        await (await admin.PostAsync(AdminRoutes.Activate(a.Id))).ShouldBeAsync(HttpStatusCode.NoContent);
        await (await admin.PostAsync(AdminRoutes.Activate(a.Id))).ShouldBeAsync(HttpStatusCode.NoContent);

        (await admin.ClinicAsync(a.Id)).Status.ShouldBe("active");
    }

    [Fact]
    [Trait("Case", "ADM-114")]
    public async Task Suspending_then_activating_keeps_every_drug_protocol_role_and_staff_member()
    {
        var admin = await Login.SharedSuperAdminAsync();
        await App.PerClassAsync("template", () => TemplateCatalog.CreateAsync(App));
        var a = await Data.Clinic();
        await Data.Staff(a).WithRole(DefaultRoles.Assistant);
        await Data.Staff(a).Inactive();
        await Data.Role(a).WithPermissions("protocols.update");
        await Data.Drug(a).WithDosing(Dosings.Tablets());
        var owner = await Login.OwnerAsync(a);
        var drugs = (await owner.DrugsAsync()).Items.Select(d => Json(d)).ToList();
        var protocols = (await owner.ProtocolsAsync()).Select(g => Json(g)).ToList();
        var roles = await admin.RolesAsync(a.Id);
        var staff = await admin.StaffAsync(a.Id);

        await (await admin.PostAsync(AdminRoutes.Suspend(a.Id))).ShouldBeAsync(HttpStatusCode.NoContent);
        await (await admin.PostAsync(AdminRoutes.Activate(a.Id))).ShouldBeAsync(HttpStatusCode.NoContent);

        (await admin.RolesAsync(a.Id)).ShouldBeEquivalentTo(roles);
        (await admin.StaffAsync(a.Id)).ShouldBeEquivalentTo(staff);
        (await owner.DrugsAsync()).Items.Select(d => Json(d)).ShouldBe(drugs);
        (await owner.ProtocolsAsync()).Select(g => Json(g)).ShouldBe(protocols);
    }

    private static string Json(object value) => System.Text.Json.JsonSerializer.Serialize(value, Harness.Assertions.Json.Options);

    [Fact]
    [Trait("Case", "ADM-115")]
    public async Task A_suspended_clinics_roles_and_staff_are_still_managed()
    {
        var admin = await Login.SharedSuperAdminAsync();
        var a = await Data.Clinic().Suspended();

        await (await admin.GetAsync(AdminRoutes.Roles(a.Id))).ShouldBeOkAsync();
        var created = await admin.PostAsync(AdminRoutes.Roles(a.Id), new { name = "While suspended", permissions = new[] { "drugs.list" } });
        await created.ShouldBeAsync(HttpStatusCode.Created);
        var role = await created.ReadAsync<RoleDto>();
        await (await admin.PutAsync(AdminRoutes.Role(a.Id, role.Id), new { name = "Still suspended", permissions = Array.Empty<string>() }))
            .ShouldBeOkAsync();
        await (await admin.DeleteAsync(AdminRoutes.Role(a.Id, role.Id))).ShouldBeAsync(HttpStatusCode.NoContent);

        await (await admin.GetAsync(AdminRoutes.Staff(a.Id))).ShouldBeOkAsync();
        var added = await admin.PostAsync(AdminRoutes.Staff(a.Id),
            new { phone = Unique.Phone(), fullName = "S", roleIds = new[] { a.RoleId(DefaultRoles.Doctor) } });
        await added.ShouldBeAsync(HttpStatusCode.Created);
        var staff = await added.ReadAsync<ClinicHub.Application.Features.Access.StaffMembers.StaffMemberDto>();
        await (await admin.PutAsync(AdminRoutes.StaffMember(a.Id, staff.Id),
            new { fullName = "S2", isActive = false, roleIds = new[] { a.RoleId(DefaultRoles.Doctor) } })).ShouldBeOkAsync();
        await (await admin.DeleteAsync(AdminRoutes.StaffMember(a.Id, staff.Id))).ShouldBeAsync(HttpStatusCode.NoContent);
    }

    [Fact]
    public async Task A_suspended_clinic_is_found_so_a_malformed_body_is_a_400()
    {
        // Ported from accept-api.py "admin filter": the clinic is entered, then the body is read
        var admin = await Login.SharedSuperAdminAsync();
        var a = await Data.Clinic().Suspended();

        await (await admin.SendRawAsync(HttpMethod.Post, AdminRoutes.Roles(a.Id), "{bad"))
            .ShouldBeProblemAsync(HttpStatusCode.BadRequest, "invalidRequest");
    }

    [Fact]
    [Trait("Case", "ADM-116")]
    public async Task Suspending_keeps_the_staff_count_and_the_owners()
    {
        var admin = await Login.SharedSuperAdminAsync();
        var a = await Data.Clinic();
        await Data.Staff(a);
        await Data.Staff(a).WithRole(DefaultRoles.Owner);
        var before = await admin.ClinicAsync(a.Id);

        await (await admin.PostAsync(AdminRoutes.Suspend(a.Id))).ShouldBeAsync(HttpStatusCode.NoContent);

        var after = await admin.ClinicAsync(a.Id);
        after.StaffCount.ShouldBe(3);
        after.StaffCount.ShouldBe(before.StaffCount);
        after.Owners.ShouldBeEquivalentTo(before.Owners);
    }
}

/// <summary>
/// Soft delete (business "القواعد التشغيلية": gone from every list, data kept, status untouched, never revealed to
/// staff; design M1.5 D4).
/// </summary>
[Collection(AdminCollection4.Name)]
[Trait("Area", "admin")]
public class DeleteClinicTests(AppFixture app) : IntegrationTest(app)
{
    [Fact]
    [Trait("Case", "ADM-123")]
    [Trait("Tier", "Smoke")]
    public async Task Delete_answers_204_and_the_clinic_is_gone_from_the_list_and_its_details()
    {
        var admin = await Login.SharedSuperAdminAsync();
        var a = await Data.Clinic();

        await (await admin.DeleteAsync(AdminRoutes.Clinic(a.Id))).ShouldBeAsync(HttpStatusCode.NoContent);

        foreach (var status in new[] { "", "&status=active", "&status=suspended" })
        {
            (await admin.SearchClinicIdsAsync(a.Name, status)).ShouldBeEmpty();
            (await admin.SearchClinicIdsAsync("", status)).ShouldNotContain(a.Id);
        }
        await (await admin.GetAsync(AdminRoutes.Clinic(a.Id))).ShouldBeProblemAsync(HttpStatusCode.NotFound, "notFound");
    }

    [Fact]
    [Trait("Case", "ADM-124")]
    public async Task Deleting_again_is_notFound()
    {
        var admin = await Login.SharedSuperAdminAsync();
        var a = await Data.Clinic();
        await (await admin.DeleteAsync(AdminRoutes.Clinic(a.Id))).ShouldBeAsync(HttpStatusCode.NoContent);

        await (await admin.DeleteAsync(AdminRoutes.Clinic(a.Id))).ShouldBeProblemAsync(HttpStatusCode.NotFound, "notFound");
    }

    [Theory]
    [Trait("Case", "ADM-126")]
    [InlineData(false)]
    [InlineData(true)]
    public async Task A_deleted_clinic_keeps_its_rows_and_status_and_records_the_time(bool suspendedFirst)
    {
        var admin = await Login.SharedSuperAdminAsync();
        await App.PerClassAsync("template", () => TemplateCatalog.CreateAsync(App));
        var a = suspendedFirst ? await Data.Clinic().Suspended() : await Data.Clinic();
        await Data.Staff(a);
        var counts = await RowsOfAsync(a.Id);
        Clock.Advance(TimeSpan.FromMinutes(9) + TimeSpan.FromSeconds(13)); // within the token's 15 min

        await (await admin.DeleteAsync(AdminRoutes.Clinic(a.Id))).ShouldBeAsync(HttpStatusCode.NoContent);

        var row = await App.QueryDbAsync(db => db.Clinics.AsNoTracking().SingleAsync(c => c.Id == a.Id));
        row.DeletedAt.ShouldBe(Clock.GetUtcNow().UtcDateTime);
        row.Status.ShouldBe(suspendedFirst ? "suspended" : "active");
        (await RowsOfAsync(a.Id)).ShouldBe(counts);
        counts.Drugs.ShouldBe(2);
        counts.Protocols.ShouldBe(1);
        counts.Roles.ShouldBe(3);
        counts.Staff.ShouldBe(2);
    }

    private Task<(int Drugs, int Protocols, int Roles, int Staff)> RowsOfAsync(int clinicId) => App.QueryDbAsync(async db => (
        await db.Drugs.IgnoreQueryFilters().CountAsync(x => x.ClinicId == clinicId),
        await db.Protocols.IgnoreQueryFilters().CountAsync(x => x.ClinicId == clinicId),
        await db.Roles.IgnoreQueryFilters().CountAsync(x => x.ClinicId == clinicId),
        await db.Staff.IgnoreQueryFilters().CountAsync(x => x.ClinicId == clinicId)));

    [Theory]
    [Trait("Case", "ADM-127")]
    [InlineData(false)]
    [InlineData(true)]
    public async Task A_deleted_clinic_leaves_its_staffs_contexts_and_switching_into_it_is_noAccess(bool suspendedFirst)
    {
        var admin = await Login.SharedSuperAdminAsync();
        var a = await Data.Clinic();
        var b = await Data.Clinic();
        var phone = Unique.Phone();
        await Data.Staff(a).WithPhone(phone);
        await Data.Staff(b).WithPhone(phone);
        var browser = await Login.AsAsync(phone);
        browser.Auth.Contexts.Select(c => c.ClinicId).ShouldBe([a.Id, b.Id], ignoreOrder: true);
        await browser.EnterClinicAsync(b.Id);
        if (suspendedFirst)
            await (await admin.PostAsync(AdminRoutes.Suspend(a.Id))).ShouldBeAsync(HttpStatusCode.NoContent);

        await (await admin.DeleteAsync(AdminRoutes.Clinic(a.Id))).ShouldBeAsync(HttpStatusCode.NoContent);

        var contexts = await (await browser.GetAsync("/api/v1/auth/contexts")).ReadAsync<List<ContextDto>>();
        contexts.Select(c => c.ClinicId).ShouldBe([b.Id]);
        var problem = await (await browser.SwitchContextAsync("clinic", a.Id)).ShouldBeProblemAsync(HttpStatusCode.Forbidden, "noAccess");
        problem.Body.ContainsKey("clinicNames").ShouldBeFalse();
    }

    [Fact]
    [Trait("Case", "ADM-128")]
    public async Task Deleting_one_of_an_owners_clinics_leaves_the_user_and_the_other_clinic_untouched()
    {
        var admin = await Login.SharedSuperAdminAsync();
        var phone = Unique.Phone();
        var a = await Data.Clinic().OwnedBy(phone);
        var b = await Data.Clinic().OwnedBy(phone);
        var bBefore = await admin.ClinicAsync(b.Id);
        var bStaff = await admin.StaffAsync(b.Id);

        await (await admin.DeleteAsync(AdminRoutes.Clinic(a.Id))).ShouldBeAsync(HttpStatusCode.NoContent);

        (await App.QueryDbAsync(db => db.Users.CountAsync(u => u.Phone == phone))).ShouldBe(1);
        (await admin.ClinicAsync(b.Id)).ShouldBeEquivalentTo(bBefore);
        (await admin.StaffAsync(b.Id)).ShouldBeEquivalentTo(bStaff);
        var owner = await Login.AsAsync(phone);
        owner.Auth.Context.ShouldNotBeNull();
        owner.Auth.Context.ClinicId.ShouldBe(b.Id);
        await (await owner.GetAsync("/api/v1/drugs")).ShouldBeOkAsync();
    }
}
