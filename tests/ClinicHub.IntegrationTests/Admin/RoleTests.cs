using System.Net;
using ClinicHub.Application.Features.Access.Roles;
using ClinicHub.Domain.Access;
using ClinicHub.IntegrationTests.Harness.Assertions;
using ClinicHub.IntegrationTests.Harness.Builders;
using ClinicHub.IntegrationTests.Harness.Clients;
using ClinicHub.IntegrationTests.Harness.Hosting;
using Microsoft.EntityFrameworkCore;
using Shouldly;

namespace ClinicHub.IntegrationTests.Admin;

/// <summary>Role calls of the admin API.</summary>
public static class RoleApi
{
    public static async Task<RoleDto> CreateRoleAsync(this ApiClient admin, int clinicId, string name, params string[] permissions)
    {
        var response = await admin.PostAsync(AdminRoutes.Roles(clinicId), new { name, permissions });
        await response.ShouldBeAsync(HttpStatusCode.Created);
        return await response.ReadAsync<RoleDto>();
    }

    public static async Task<RoleDto> UpdateRoleAsync(this ApiClient admin, int clinicId, int roleId, string name, params string[] permissions)
    {
        var response = await admin.PutAsync(AdminRoutes.Role(clinicId, roleId), new { name, permissions });
        await response.ShouldBeOkAsync();
        return await response.ReadAsync<RoleDto>();
    }
}

/// <summary>
/// A clinic's roles through the admin API (platform-admin business "الأدوار"; tech "Roles and staff (M1.5.3)": the
/// Owner first then by name, requirements added on save, unique names per clinic case-insensitively, the Owner locked,
/// <c>roleInUse</c> for any holder).
/// </summary>
[Collection(AdminCollection5.Name)]
[Trait("Area", "admin")]
public class RoleTests(AppFixture app) : IntegrationTest(app)
{
    private static async Task<Problem> RefusedAsync(HttpResponseMessage response, HttpStatusCode status, string code) =>
        await response.ShouldBeProblemAsync(status, code);

    private Task<int> RoleCountAsync(int clinicId) =>
        App.QueryDbAsync(db => db.Roles.IgnoreQueryFilters().CountAsync(r => r.ClinicId == clinicId));

    // ---- List ----

    [Fact]
    [Trait("Case", "ADM-143")]
    public async Task The_Owner_comes_first_then_the_roles_by_name()
    {
        var admin = await Login.SharedSuperAdminAsync();
        var a = await Data.Clinic();
        await Data.Role(a).Named("Viewer");

        (await admin.RolesAsync(a.Id)).Select(r => r.Name).ShouldBe(["Owner", "Assistant", "Doctor", "Viewer"]);
    }

    [Fact]
    [Trait("Case", "ADM-144")]
    public async Task The_Owner_shows_every_catalog_key_in_order_without_storing_any()
    {
        var admin = await Login.SharedSuperAdminAsync();
        var a = await Data.Clinic();

        var response = await admin.GetAsync(AdminRoutes.Roles(a.Id));

        await response.ShouldBeOkAsync();
        (await response.ReadNodeAsync())[0]!.AsObject().Select(p => p.Key).OrderBy(k => k)
            .ShouldBe(["id", "isOwner", "name", "permissions", "staffCount"]);
        var owner = (await response.ReadAsync<List<RoleDto>>())[0];
        owner.IsOwner.ShouldBeTrue();
        owner.Permissions.ShouldBe(PermissionKeys.CatalogOrder);
        (await App.QueryDbAsync(db => db.Set<RolePermission>().CountAsync(p => p.RoleId == owner.Id))).ShouldBe(0);
    }

    [Fact]
    [Trait("Case", "ADM-145")]
    public async Task The_staff_count_counts_active_and_inactive_holders()
    {
        var admin = await Login.SharedSuperAdminAsync();
        var a = await Data.Clinic();
        var role = await Data.Role(a);
        await Data.Staff(a).WithRoles(role.Id);
        await Data.Staff(a).WithRoles(role.Id).Inactive();
        await Data.Staff(a).WithRoles(role.Id).Inactive();

        (await admin.RolesAsync(a.Id)).Single(r => r.Id == role.Id).StaffCount.ShouldBe(3);
    }

    [Fact]
    [Trait("Case", "ADM-146")]
    public async Task A_stored_key_no_longer_in_the_catalog_is_left_out()
    {
        var admin = await Login.SharedSuperAdminAsync();
        var a = await Data.Clinic();
        var role = await Data.Role(a).WithPermissions("drugs.list");
        await App.OutsideTheApp.ExecuteAsync("INSERT INTO \"RolePermissions\" (\"RoleId\", \"Permission\") VALUES (@p0, 'retired.key')", role.Id);

        (await admin.RolesAsync(a.Id)).Single(r => r.Id == role.Id).Permissions.ShouldBe(["drugs.list"]);
    }

    // ---- Create ----

    [Fact]
    [Trait("Case", "ADM-147")]
    [Trait("Tier", "Smoke")]
    public async Task A_new_role_is_saved_trimmed_with_the_permissions_it_needs()
    {
        var admin = await Login.SharedSuperAdminAsync();
        var a = await Data.Clinic();

        var response = await admin.PostAsync(AdminRoutes.Roles(a.Id), new { name = "  Editors  ", permissions = new[] { "drugs.update" } });

        await response.ShouldBeAsync(HttpStatusCode.Created);
        response.LocationPath().ShouldBe($"/api/v1/admin/clinics/{a.Id}/roles");
        var role = await response.ReadAsync<RoleDto>();
        role.Name.ShouldBe("Editors");
        role.IsOwner.ShouldBeFalse();
        role.StaffCount.ShouldBe(0);
        role.Permissions.ShouldBe(["drugs.list", "drugs.details", "drugs.update"]);
        (await admin.RolesAsync(a.Id)).Single(r => r.Id == role.Id).Permissions.ShouldBe(["drugs.list", "drugs.details", "drugs.update"]);
    }

    [Fact]
    [Trait("Case", "ADM-148")]
    public async Task Edit_groups_brings_open_group_group_list_and_drug_list()
    {
        var admin = await Login.SharedSuperAdminAsync();
        var a = await Data.Clinic();

        var role = await admin.CreateRoleAsync(a.Id, "Group editors", "groups.update");

        role.Permissions.ShouldBe(["drugs.list", "groups.list", "groups.details", "groups.update"]);
    }

    [Theory]
    [Trait("Case", "ADM-149")]
    [InlineData("prescriptions.create", new[] { "drugs.list", "prescriptions.create" })]
    [InlineData("groups.create", new[] { "drugs.list", "groups.list", "groups.create" })]
    [InlineData("drugs.delete", new[] { "drugs.list", "drugs.details", "drugs.delete" })]
    public async Task Each_permission_brings_what_it_needs(string picked, string[] saved)
    {
        var admin = await Login.SharedSuperAdminAsync();
        var a = await Data.Clinic();

        (await admin.CreateRoleAsync(a.Id, $"Role {Unique.Next()}", picked)).Permissions.ShouldBe(saved);
    }

    [Fact]
    public async Task Several_picked_permissions_are_closed_in_catalog_order()
    {
        // Ported from accept-api.py "roles" (create several)
        var admin = await Login.SharedSuperAdminAsync();
        var a = await Data.Clinic();

        (await admin.CreateRoleAsync(a.Id, "Multi", "groups.update", "drugs.delete", "drugs.list")).Permissions
            .ShouldBe(["drugs.list", "drugs.details", "drugs.delete", "groups.list", "groups.details", "groups.update"]);
    }

    [Fact]
    [Trait("Case", "ADM-150")]
    public async Task A_role_with_no_permissions_is_allowed()
    {
        var admin = await Login.SharedSuperAdminAsync();
        var a = await Data.Clinic();

        (await admin.CreateRoleAsync(a.Id, "Nothing")).Permissions.ShouldBeEmpty();
    }

    [Fact]
    [Trait("Case", "ADM-151")]
    public async Task A_staff_member_whose_only_role_grants_nothing_has_no_permissions()
    {
        var admin = await Login.SharedSuperAdminAsync();
        var a = await Data.Clinic();
        var role = await admin.CreateRoleAsync(a.Id, "Empty");
        var staff = await Data.Staff(a).WithRoles(role.Id);

        var browser = await Login.StaffAsync(staff);

        (await browser.MeAsync()).Permissions.ShouldBeEmpty();
        await (await browser.GetAsync("/api/v1/drugs")).ShouldBeProblemAsync(HttpStatusCode.Forbidden, "forbidden");
    }

    [Fact]
    [Trait("Case", "ADM-152")]
    public async Task A_body_without_permissions_is_refused_on_create_and_update()
    {
        var admin = await Login.SharedSuperAdminAsync();
        var a = await Data.Clinic();
        var role = await Data.Role(a).WithPermissions("drugs.update");
        var roles = await RoleCountAsync(a.Id);

        await RefusedAsync(await admin.PostAsync(AdminRoutes.Roles(a.Id), new { name = "No perms" }), HttpStatusCode.BadRequest, "invalidRequest");
        await RefusedAsync(await admin.PostAsync(AdminRoutes.Roles(a.Id), new { name = "No perms", permissions = (string[])null }),
            HttpStatusCode.BadRequest, "invalidRequest");
        await RefusedAsync(await admin.PutAsync(AdminRoutes.Role(a.Id, role.Id), new { name = role.Name }), HttpStatusCode.BadRequest, "invalidRequest");

        (await RoleCountAsync(a.Id)).ShouldBe(roles);
        (await admin.RolesAsync(a.Id)).Single(r => r.Id == role.Id).Permissions.ShouldBe(["drugs.list", "drugs.details", "drugs.update"]);
    }

    [Fact]
    [Trait("Case", "ADM-153")]
    public async Task Unknown_keys_are_refused_with_one_unknownPermission_error()
    {
        var admin = await Login.SharedSuperAdminAsync();
        var a = await Data.Clinic();
        var roles = await RoleCountAsync(a.Id);

        var one = await RefusedAsync(await admin.PostAsync(AdminRoutes.Roles(a.Id), new { name = "Bad", permissions = new[] { "nope.x" } }),
            HttpStatusCode.BadRequest, "unknownPermission");
        one.Errors.Select(e => (e.Code, e.Field)).ShouldBe([("unknownPermission", "permissions")]);
        var two = await RefusedAsync(await admin.PostAsync(AdminRoutes.Roles(a.Id),
            new { name = "Bad keys", permissions = new[] { "nope.x", "drugs.list", "bad.y" } }), HttpStatusCode.BadRequest, "unknownPermission");
        two.Errors.Select(e => (e.Code, e.Field)).ShouldBe([("unknownPermission", "permissions")]);

        (await RoleCountAsync(a.Id)).ShouldBe(roles);
    }

    [Fact]
    [Trait("Case", "ADM-154")]
    public async Task A_repeated_key_is_stored_once()
    {
        var admin = await Login.SharedSuperAdminAsync();
        var a = await Data.Clinic();

        var role = await admin.CreateRoleAsync(a.Id, "Dups", "drugs.list", "drugs.list");

        role.Permissions.ShouldBe(["drugs.list"]);
        (await App.QueryDbAsync(db => db.Set<RolePermission>().CountAsync(p => p.RoleId == role.Id))).ShouldBe(1);
    }

    [Theory]
    [Trait("Case", "ADM-155")]
    [InlineData("  ", "nameRequired")]
    [InlineData("a\u0000b", "nameInvalid")]
    [InlineData("a\u202Eb", "nameInvalid")]
    [InlineData("\u200B", "nameRequired")]
    public async Task A_blank_or_invalid_role_name_is_refused(string name, string code)
    {
        var admin = await Login.SharedSuperAdminAsync();
        var a = await Data.Clinic();

        (await RefusedAsync(await admin.PostAsync(AdminRoutes.Roles(a.Id), new { name, permissions = Array.Empty<string>() }),
            HttpStatusCode.BadRequest, code)).ShouldHaveError("name", code);
    }

    [Fact]
    [Trait("Case", "ADM-156")]
    public async Task A_role_name_of_100_characters_is_accepted_and_101_is_refused()
    {
        var admin = await Login.SharedSuperAdminAsync();
        var a = await Data.Clinic();
        var name100 = new string('r', 100);

        (await admin.CreateRoleAsync(a.Id, name100)).Name.ShouldBe(name100);
        (await RefusedAsync(await admin.PostAsync(AdminRoutes.Roles(a.Id), new { name = name100 + "s", permissions = Array.Empty<string>() }),
            HttpStatusCode.BadRequest, "nameTooLong")).Errors.Select(e => (e.Code, e.Field)).ShouldBe([("nameTooLong", "name")]);
    }

    [Fact]
    [Trait("Case", "ADM-157")]
    public async Task An_Arabic_role_name_is_stored_as_typed()
    {
        var admin = await Login.SharedSuperAdminAsync();
        var a = await Data.Clinic();

        var role = await admin.CreateRoleAsync(a.Id, "قراءة فقط", "drugs.details");

        role.Name.ShouldBe("قراءة فقط");
        (await admin.RolesAsync(a.Id)).ShouldContain(r => r.Id == role.Id && r.Name == "قراءة فقط");
    }

    [Fact]
    [Trait("Case", "ADM-158")]
    public async Task A_blank_name_and_an_unknown_key_give_both_errors_name_first()
    {
        var admin = await Login.SharedSuperAdminAsync();
        var a = await Data.Clinic();

        var problem = await RefusedAsync(await admin.PostAsync(AdminRoutes.Roles(a.Id), new { name = " ", permissions = new[] { "zzz" } }),
            HttpStatusCode.BadRequest, "nameRequired");

        problem.Errors.Select(e => (e.Code, e.Field)).ShouldBe([("nameRequired", "name"), ("unknownPermission", "permissions")]);
    }

    [Theory]
    [Trait("Case", "ADM-159")]
    [InlineData(" Editors")]
    [InlineData("EDITORS")]
    [InlineData("editors ")]
    public async Task A_name_taken_in_the_clinic_whatever_its_case_or_spaces_is_refused(string name)
    {
        var admin = await Login.SharedSuperAdminAsync();
        var a = await Data.Clinic();
        await Data.Role(a).Named("Editors");
        var roles = await RoleCountAsync(a.Id);

        await RefusedAsync(await admin.PostAsync(AdminRoutes.Roles(a.Id), new { name, permissions = Array.Empty<string>() }),
            HttpStatusCode.Conflict, "roleNameTaken");

        (await RoleCountAsync(a.Id)).ShouldBe(roles);
    }

    [Theory]
    [InlineData("DOCTOR")]
    [InlineData("  assistant  ")]
    public async Task A_default_roles_name_in_another_case_is_taken(string name)
    {
        // Ported from accept-api.py "roles" (roleNameTaken)
        var admin = await Login.SharedSuperAdminAsync();
        var a = await Data.Clinic();

        await RefusedAsync(await admin.PostAsync(AdminRoutes.Roles(a.Id), new { name, permissions = Array.Empty<string>() }),
            HttpStatusCode.Conflict, "roleNameTaken");
    }

    [Theory]
    [Trait("Case", "ADM-160")]
    [InlineData("owner")]
    [InlineData("OWNER")]
    public async Task The_Owners_name_in_another_case_is_taken(string name)
    {
        var admin = await Login.SharedSuperAdminAsync();
        var a = await Data.Clinic();

        await RefusedAsync(await admin.PostAsync(AdminRoutes.Roles(a.Id), new { name, permissions = Array.Empty<string>() }),
            HttpStatusCode.Conflict, "roleNameTaken");
    }

    [Fact]
    [Trait("Case", "ADM-161")]
    public async Task Role_names_are_unique_per_clinic_only()
    {
        var admin = await Login.SharedSuperAdminAsync();
        var a = await Data.Clinic();
        var b = await Data.Clinic();
        await Data.Role(b).Named("Editors");

        (await admin.CreateRoleAsync(a.Id, "Editors")).Name.ShouldBe("Editors");
    }

    [Fact]
    public async Task Malformed_JSON_on_create_is_refused_with_invalidRequest()
    {
        // Ported from accept-api.py "roles"
        var admin = await Login.SharedSuperAdminAsync();
        var a = await Data.Clinic();

        await RefusedAsync(await admin.SendRawAsync(HttpMethod.Post, AdminRoutes.Roles(a.Id), "{bad"), HttpStatusCode.BadRequest, "invalidRequest");
    }

    // ---- Update ----

    [Fact]
    [Trait("Case", "ADM-162")]
    [Trait("Tier", "Smoke")]
    public async Task An_update_renames_the_role_and_replaces_its_keys_with_the_closed_set()
    {
        var admin = await Login.SharedSuperAdminAsync();
        var a = await Data.Clinic();

        var updated = await admin.UpdateRoleAsync(a.Id, a.RoleId("Doctor"), "Doctor Plus", "groups.update");

        updated.Name.ShouldBe("Doctor Plus");
        updated.Permissions.ShouldBe(["drugs.list", "groups.list", "groups.details", "groups.update"]);
        (await admin.RolesAsync(a.Id)).Single(r => r.Id == a.RoleId("Doctor")).Permissions
            .ShouldBe(["drugs.list", "groups.list", "groups.details", "groups.update"]);
        (await App.QueryDbAsync(db => db.Set<RolePermission>().CountAsync(p => p.RoleId == updated.Id))).ShouldBe(4);
    }

    [Fact]
    [Trait("Case", "ADM-163")]
    public async Task A_role_may_be_renamed_to_another_case_of_its_own_name()
    {
        var admin = await Login.SharedSuperAdminAsync();
        var a = await Data.Clinic();

        (await admin.UpdateRoleAsync(a.Id, a.RoleId("Doctor"), "doctor", PermissionKeys.CatalogOrder.ToArray())).Name.ShouldBe("doctor");
    }

    [Fact]
    [Trait("Case", "ADM-164")]
    public async Task Renaming_a_role_to_another_roles_name_is_refused_and_it_stays_unchanged()
    {
        var admin = await Login.SharedSuperAdminAsync();
        var a = await Data.Clinic();
        await Data.Role(a).Named("Editors");
        var before = (await admin.RolesAsync(a.Id)).Single(r => r.Name == "Doctor");

        await RefusedAsync(await admin.PutAsync(AdminRoutes.Role(a.Id, before.Id), new { name = "editors", permissions = Array.Empty<string>() }),
            HttpStatusCode.Conflict, "roleNameTaken");
        await RefusedAsync(await admin.PutAsync(AdminRoutes.Role(a.Id, before.Id), new { name = "ASSISTANT", permissions = Array.Empty<string>() }),
            HttpStatusCode.Conflict, "roleNameTaken");

        (await admin.RolesAsync(a.Id)).Single(r => r.Id == before.Id).ShouldBeEquivalentTo(before);
    }

    [Fact]
    public async Task Refused_updates_leave_the_role_unchanged()
    {
        // Ported from accept-api.py "roles" (update unknownPermission, permissions missing)
        var admin = await Login.SharedSuperAdminAsync();
        var a = await Data.Clinic();
        var role = await admin.CreateRoleAsync(a.Id, "Editors", "groups.update");

        await RefusedAsync(await admin.PutAsync(AdminRoutes.Role(a.Id, role.Id), new { name = "Editors", permissions = new[] { "x.y" } }),
            HttpStatusCode.BadRequest, "unknownPermission");
        await RefusedAsync(await admin.PutAsync(AdminRoutes.Role(a.Id, role.Id), new { name = "Editors" }),
            HttpStatusCode.BadRequest, "invalidRequest");

        (await admin.RolesAsync(a.Id)).Single(r => r.Id == role.Id).ShouldBeEquivalentTo(role);
    }

    [Fact]
    [Trait("Case", "ADM-165")]
    [Trait("Case", "ADM-166")]
    public async Task The_Owner_role_cannot_be_changed_or_deleted()
    {
        var admin = await Login.SharedSuperAdminAsync();
        var a = await Data.Clinic();
        var owner = a.RoleId(DefaultRoles.Owner);

        await RefusedAsync(await admin.PutAsync(AdminRoutes.Role(a.Id, owner), new { name = "Owner", permissions = Array.Empty<string>() }),
            HttpStatusCode.Conflict, "roleLocked");
        await RefusedAsync(await admin.PutAsync(AdminRoutes.Role(a.Id, owner), new { name = "Boss", permissions = new[] { "drugs.list" } }),
            HttpStatusCode.Conflict, "roleLocked");
        await RefusedAsync(await admin.PutAsync(AdminRoutes.Role(a.Id, owner), new { name = "", permissions = Array.Empty<string>() }),
            HttpStatusCode.BadRequest, "nameRequired");
        await RefusedAsync(await admin.DeleteAsync(AdminRoutes.Role(a.Id, owner)), HttpStatusCode.Conflict, "roleLocked");

        var role = (await admin.RolesAsync(a.Id))[0];
        role.Id.ShouldBe(owner);
        role.Name.ShouldBe("Owner");
        role.IsOwner.ShouldBeTrue();
        role.Permissions.ShouldBe(PermissionKeys.CatalogOrder);
    }

    [Fact]
    [Trait("Case", "ADM-167")]
    public async Task An_unknown_role_id_is_notFound_on_update_and_delete()
    {
        var admin = await Login.SharedSuperAdminAsync();
        var a = await Data.Clinic();

        await RefusedAsync(await admin.PutAsync(AdminRoutes.Role(a.Id, 999_999), new { name = "X", permissions = Array.Empty<string>() }),
            HttpStatusCode.NotFound, "notFound");
        await RefusedAsync(await admin.DeleteAsync(AdminRoutes.Role(a.Id, 999_999)), HttpStatusCode.NotFound, "notFound");
    }

    [Fact]
    public async Task Another_clinics_role_id_is_notFound_and_that_role_is_untouched()
    {
        // Ported from accept-api.py "roles" (cross-clinic role id)
        var admin = await Login.SharedSuperAdminAsync();
        var a = await Data.Clinic();
        var b = await Data.Clinic();
        var before = await admin.RolesAsync(b.Id);

        foreach (var name in new[] { "Doctor", "Owner" })
        {
            await RefusedAsync(await admin.PutAsync(AdminRoutes.Role(a.Id, b.RoleId(name)), new { name = "Stolen", permissions = Array.Empty<string>() }),
                HttpStatusCode.NotFound, "notFound");
            await RefusedAsync(await admin.DeleteAsync(AdminRoutes.Role(a.Id, b.RoleId(name))), HttpStatusCode.NotFound, "notFound");
        }

        (await admin.RolesAsync(b.Id)).ShouldBeEquivalentTo(before);
    }

    // ---- Delete ----

    [Fact]
    [Trait("Case", "ADM-168")]
    [Trait("Tier", "Smoke")]
    public async Task An_unused_role_is_deleted_then_notFound()
    {
        var admin = await Login.SharedSuperAdminAsync();
        var a = await Data.Clinic();
        var doctor = a.RoleId("Doctor");

        await (await admin.DeleteAsync(AdminRoutes.Role(a.Id, doctor))).ShouldBeAsync(HttpStatusCode.NoContent);

        (await admin.RolesAsync(a.Id)).Select(r => r.Name).ShouldBe(["Owner", "Assistant"]);
        await RefusedAsync(await admin.DeleteAsync(AdminRoutes.Role(a.Id, doctor)), HttpStatusCode.NotFound, "notFound");
        (await App.QueryDbAsync(db => db.Set<RolePermission>().CountAsync(p => p.RoleId == doctor))).ShouldBe(0);
    }

    [Fact]
    [Trait("Case", "ADM-169")]
    public async Task A_role_held_by_an_active_staff_member_is_in_use()
    {
        var admin = await Login.SharedSuperAdminAsync();
        var a = await Data.Clinic();
        await Data.Staff(a).WithRole("Assistant");

        await RefusedAsync(await admin.DeleteAsync(AdminRoutes.Role(a.Id, a.RoleId("Assistant"))), HttpStatusCode.Conflict, "roleInUse");

        (await admin.RolesAsync(a.Id)).ShouldContain(r => r.Id == a.RoleId("Assistant"));
    }

    [Fact]
    [Trait("Case", "ADM-170")]
    public async Task A_role_held_only_by_an_inactive_staff_member_is_in_use()
    {
        var admin = await Login.SharedSuperAdminAsync();
        var a = await Data.Clinic();
        await Data.Staff(a).WithRole("Assistant").Inactive();

        await RefusedAsync(await admin.DeleteAsync(AdminRoutes.Role(a.Id, a.RoleId("Assistant"))), HttpStatusCode.Conflict, "roleInUse");

        (await admin.RolesAsync(a.Id)).Single(r => r.Id == a.RoleId("Assistant")).StaffCount.ShouldBe(1);
    }

    // ---- Effects ----

    [Fact]
    [Trait("Case", "ADM-171")]
    public async Task A_renamed_role_shows_its_new_name_in_its_holders_roles_at_once()
    {
        var admin = await Login.SharedSuperAdminAsync();
        var a = await Data.Clinic();
        var role = await Data.Role(a).Named("Readers");
        var holder = await Data.Staff(a).WithRoles(role.Id);
        (await admin.StaffAsync(a.Id)).Single(s => s.Id == holder.Id).Roles.Select(r => r.Name).ShouldBe(["Readers"]);

        await admin.UpdateRoleAsync(a.Id, role.Id, "Senior readers", "drugs.list");

        (await admin.StaffAsync(a.Id)).Single(s => s.Id == holder.Id).Roles.Select(r => r.Name).ShouldBe(["Senior readers"]);
    }

    [Fact]
    [Trait("Case", "ADM-172")]
    public async Task Saving_a_role_unchanged_does_not_move_its_update_time()
    {
        var admin = await Login.SharedSuperAdminAsync();
        var a = await Data.Clinic();
        var role = await admin.CreateRoleAsync(a.Id, "Steady", "drugs.update");
        var stamped = await App.QueryDbAsync(db => db.Roles.IgnoreQueryFilters().Where(r => r.Id == role.Id).Select(r => r.UpdatedAt).SingleAsync());
        Clock.Advance(TimeSpan.FromMinutes(5));

        var saved = await admin.UpdateRoleAsync(a.Id, role.Id, "Steady", "drugs.update");

        saved.Permissions.ShouldBe(["drugs.list", "drugs.details", "drugs.update"]);
        (await App.QueryDbAsync(db => db.Roles.IgnoreQueryFilters().Where(r => r.Id == role.Id).Select(r => r.UpdatedAt).SingleAsync()))
            .ShouldBe(stamped);
    }
}

/// <summary>
/// The Owner label: no other role may be named "Owner" or «المالك» (M1.6.0; platform-admin tech "Roles and staff
/// screens": format characters, combining marks and the tatweel removed, the superscript alef read as an alef, trimmed,
/// compared case-insensitively; look-alike letters of another script pass).
/// </summary>
[Collection(AdminCollection5.Name)]
[Trait("Area", "admin")]
public class OwnerLabelTests(AppFixture app) : IntegrationTest(app)
{
    private Task<int> RoleCountAsync(int clinicId) =>
        App.QueryDbAsync(db => db.Roles.IgnoreQueryFilters().CountAsync(r => r.ClinicId == clinicId));

    [Theory]
    [Trait("Case", "ADM-262")]
    [InlineData("المالك")]
    [InlineData(" المالك ")]
    public async Task A_new_role_named_like_the_Arabic_Owner_label_is_refused(string name)
    {
        var admin = await Login.SharedSuperAdminAsync();
        var a = await Data.Clinic();
        var roles = await RoleCountAsync(a.Id);

        await (await admin.PostAsync(AdminRoutes.Roles(a.Id), new { name, permissions = Array.Empty<string>() }))
            .ShouldBeProblemAsync(HttpStatusCode.Conflict, "roleNameTaken");

        (await RoleCountAsync(a.Id)).ShouldBe(roles);
    }

    [Theory]
    [Trait("Case", "ADM-263")]
    [InlineData("المالك")]
    [InlineData("OWNER")]
    public async Task Renaming_a_custom_role_to_an_Owner_label_is_refused(string name)
    {
        var admin = await Login.SharedSuperAdminAsync();
        var a = await Data.Clinic();
        var role = await Data.Role(a).Named("Custom").WithPermissions("drugs.list");

        await (await admin.PutAsync(AdminRoutes.Role(a.Id, role.Id), new { name, permissions = new[] { "drugs.list" } }))
            .ShouldBeProblemAsync(HttpStatusCode.Conflict, "roleNameTaken");

        (await admin.RolesAsync(a.Id)).Single(r => r.Id == role.Id).Name.ShouldBe("Custom");
    }

    [Theory]
    [Trait("Case", "ADM-265")]
    [InlineData("الما\u200Fلك")]
    [InlineData("المال\u200Bك")]
    [InlineData("المـالك")]
    [InlineData("المالِك")]
    [InlineData("المٰلك")]
    [InlineData("Ow\u200Bner")]
    public async Task Hidden_marks_tatweel_harakat_and_the_superscript_alef_do_not_get_past_the_Owner_label(string name)
    {
        var admin = await Login.SharedSuperAdminAsync();
        var a = await Data.Clinic();
        var roles = await RoleCountAsync(a.Id);

        await (await admin.PostAsync(AdminRoutes.Roles(a.Id), new { name, permissions = Array.Empty<string>() }))
            .ShouldBeProblemAsync(HttpStatusCode.Conflict, "roleNameTaken");

        (await RoleCountAsync(a.Id)).ShouldBe(roles);
    }

    [Theory]
    [Trait("Case", "ADM-266")]
    [InlineData("مالك")]
    [InlineData("Owners")]
    [InlineData("The Owner")]
    public async Task Names_that_only_contain_or_resemble_the_label_are_allowed(string name)
    {
        var admin = await Login.SharedSuperAdminAsync();
        var a = await Data.Clinic();

        (await admin.CreateRoleAsync(a.Id, name)).Name.ShouldBe(name);
    }

    [Fact]
    [Trait("Case", "ADM-267")]
    public async Task A_look_alike_letter_of_another_script_passes()
    {
        var admin = await Login.SharedSuperAdminAsync();
        var a = await Data.Clinic();

        (await admin.CreateRoleAsync(a.Id, "\u041Ewner")).Name.ShouldBe("\u041Ewner");
    }

    [Fact]
    [Trait("Case", "ADM-269")]
    public async Task A_custom_role_stored_with_the_label_must_be_renamed_to_be_saved()
    {
        var admin = await Login.SharedSuperAdminAsync();
        var a = await Data.Clinic();
        var role = await Data.Role(a).Named("Before").WithPermissions("drugs.list");
        await App.OutsideTheApp.ExecuteAsync("UPDATE \"Roles\" SET \"Name\" = 'المالك' WHERE \"Id\" = @p0", role.Id);

        await (await admin.PutAsync(AdminRoutes.Role(a.Id, role.Id), new { name = "المالك", permissions = new[] { "drugs.list" } }))
            .ShouldBeProblemAsync(HttpStatusCode.Conflict, "roleNameTaken");

        (await admin.UpdateRoleAsync(a.Id, role.Id, "Renamed", "drugs.list")).Name.ShouldBe("Renamed");
    }
}
