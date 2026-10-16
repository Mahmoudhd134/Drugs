using System.Net;
using ClinicHub.Application.Features.Access.Roles;
using ClinicHub.Application.Features.Access.StaffMembers;
using ClinicHub.Application.Features.Identity.Sessions;
using ClinicHub.IntegrationTests.Harness.Assertions;
using ClinicHub.IntegrationTests.Harness.Builders;
using ClinicHub.IntegrationTests.Harness.Clients;
using ClinicHub.IntegrationTests.Harness.Hosting;
using Microsoft.EntityFrameworkCore;
using Shouldly;

namespace ClinicHub.IntegrationTests.Admin;

/// <summary>Staff calls of the admin API.</summary>
public static class StaffApi
{
    public static Task<HttpResponseMessage> AddStaffAsync(this ApiClient admin, int clinicId, string phone, string fullName, params int[] roleIds) =>
        admin.PostAsync(AdminRoutes.Staff(clinicId), new { phone, fullName, roleIds });

    public static async Task<StaffMemberDto> AddedStaffAsync(this ApiClient admin, int clinicId, string phone, string fullName, params int[] roleIds)
    {
        var response = await admin.AddStaffAsync(clinicId, phone, fullName, roleIds);
        await response.ShouldBeAsync(HttpStatusCode.Created);
        return await response.ReadAsync<StaffMemberDto>();
    }

    public static Task<HttpResponseMessage> UpdateStaffAsync(this ApiClient admin, int clinicId, int staffId, string fullName, bool isActive,
        params int[] roleIds) =>
        admin.PutAsync(AdminRoutes.StaffMember(clinicId, staffId), new { fullName, isActive, roleIds });
}

/// <summary>
/// The staff list and its search (platform-admin tech "Roles and staff": all staff by full name then id; the search
/// matches the Arabic-normalized name, and a phone-like term the stored phone's digits with leading zeros dropped).
/// </summary>
[Collection(AdminCollection6.Name)]
[Trait("Area", "admin")]
public class StaffListTests(AppFixture app) : IntegrationTest(app)
{
    [Fact]
    [Trait("Case", "ADM-196")]
    public async Task The_list_holds_active_and_inactive_staff_by_name_then_id_with_roles_Owner_first()
    {
        var admin = await Login.SharedSuperAdminAsync();
        var a = await Data.Clinic().OwnedBy(Unique.Phone(), "Carol Owner");
        var alice1 = await Data.Staff(a).Named("Alice").WithRole(DefaultRoles.Doctor).WithRole(DefaultRoles.Assistant);
        var alice2 = await Data.Staff(a).Named("Alice");
        var bob = await Data.Staff(a).Named("Bob").Inactive();
        var dave = await Data.Staff(a).Named("Dave").WithRole(DefaultRoles.Assistant).WithRole(DefaultRoles.Owner);

        var response = await admin.GetAsync(AdminRoutes.Staff(a.Id));

        await response.ShouldBeOkAsync();
        var staff = (await response.ReadAsync<ClinicHub.Application.Common.Paging.PagedResult<StaffMemberDto>>()).Items;
        staff.Select(s => s.Id).ShouldBe([alice1.Id, alice2.Id, bob.Id, a.Owner.Id, dave.Id]);
        staff.Select(s => s.IsActive).ShouldBe([true, true, false, true, true]);
        staff[0].Roles.Select(r => r.Name).ShouldBe(["Assistant", "Doctor"]);
        staff[3].Roles.Select(r => (r.Name, r.IsOwner)).ShouldBe([("Owner", true)]);
        staff[4].Roles.Select(r => r.Name).ShouldBe(["Owner", "Assistant"]);
        staff[2].Phone.ShouldBe(bob.Phone);
        staff.ShouldAllBe(s => s.Phone.StartsWith("+20"));
        (await response.ReadNodeAsync())["items"]![0]!.AsObject().Select(p => p.Key).OrderBy(k => k)
            .ShouldBe(["fullName", "id", "isActive", "phone", "roles", "userId"]);
    }

    [Fact]
    [Trait("Case", "ADM-197")]
    public async Task The_staff_list_is_paged_with_the_page_size_capped_at_100()
    {
        var admin = await Login.SharedSuperAdminAsync();
        var a = await Data.Clinic().OwnedBy(Unique.Phone(), "A Owner");
        await Data.Staff(a).Named("B Staff");
        var c = await Data.Staff(a).Named("C Staff");
        var d = await Data.Staff(a).Named("D Staff");

        var page = await admin.StaffPageAsync(a.Id, "pageSize=2&page=2");

        page.Items.Select(s => s.Id).ShouldBe([c.Id, d.Id]);
        page.TotalCount.ShouldBe(4);
        page.Page.ShouldBe(2);
        (await admin.StaffPageAsync(a.Id, "pageSize=1000")).PageSize.ShouldBe(100);
    }

    [Fact]
    [Trait("Case", "ADM-198")]
    public async Task The_name_search_is_case_insensitive_contains()
    {
        var admin = await Login.SharedSuperAdminAsync();
        var a = await Data.Clinic().OwnedBy(Unique.Phone(), "Dev Owner");
        var assistant = await Data.Staff(a).Named("Dev Assistant");
        await Data.Staff(a).Named("Someone Else");

        (await admin.SearchStaffIdsAsync(a.Id, "DEV")).ShouldBe([assistant.Id, a.Owner.Id]);
        (await admin.SearchStaffIdsAsync(a.Id, "owner")).ShouldBe([a.Owner.Id]);
        (await admin.SearchStaffIdsAsync(a.Id, "zzz")).ShouldBeEmpty();
    }

    [Fact]
    [Trait("Case", "ADM-199")]
    [Trait("Tier", "Smoke")]
    public async Task A_local_phone_finds_the_staff_member()
    {
        var admin = await Login.SharedSuperAdminAsync();
        var a = await Data.Clinic();
        var s = await Data.Staff(a).WithPhone("+201000000003");

        (await admin.SearchStaffIdsAsync(a.Id, "01000000003")).ShouldBe([s.Id]);
    }

    [Fact]
    [Trait("Case", "ADM-200")]
    public async Task Arabic_Indic_digits_find_the_staff_member()
    {
        var admin = await Login.SharedSuperAdminAsync();
        var a = await Data.Clinic();
        var s = await Data.Staff(a).WithPhone("+201000000002");

        (await admin.SearchStaffIdsAsync(a.Id, "٠١٠٠٠٠٠٠٠٠٢")).ShouldBe([s.Id]);
    }

    [Theory]
    [Trait("Case", "ADM-201")]
    [InlineData("+201000000003")]
    [InlineData("00201000000003")]
    [InlineData("1000000003")]
    [InlineData("(010) 0000-0003")]
    public async Task International_and_formatted_phones_find_the_staff_member(string term)
    {
        var admin = await Login.SharedSuperAdminAsync();
        var a = await Data.Clinic();
        var s = await Data.Staff(a).WithPhone("+201000000003");

        (await admin.SearchStaffIdsAsync(a.Id, term)).ShouldBe([s.Id]);
    }

    [Theory]
    [Trait("Case", "ADM-202")]
    [InlineData("+2010000000")]
    [InlineData("0100000000")]
    public async Task A_partial_phone_finds_every_staff_member_containing_it(string term)
    {
        var admin = await Login.SharedSuperAdminAsync();
        var a = await Data.Clinic();
        var two = await Data.Staff(a).WithPhone("+201000000002").Named("Two");
        var three = await Data.Staff(a).WithPhone("+201000000003").Named("Three");

        (await admin.SearchStaffIdsAsync(a.Id, term)).ShouldBe([three.Id, two.Id]);
    }

    [Fact]
    [Trait("Case", "ADM-203")]
    public async Task A_trunk_zero_after_the_country_code_does_not_match()
    {
        var admin = await Login.SharedSuperAdminAsync();
        var a = await Data.Clinic();
        await Data.Staff(a).WithPhone("+201000000003");

        (await admin.SearchStaffIdsAsync(a.Id, "+20 01000000003")).ShouldBeEmpty();
    }

    [Fact]
    [Trait("Case", "ADM-204")]
    public async Task A_NUL_in_the_search_is_dropped()
    {
        var admin = await Login.SharedSuperAdminAsync();
        var a = await Data.Clinic().OwnedBy(Unique.Phone(), "Dev Owner");
        var assistant = await Data.Staff(a).Named("Dev Assistant");
        await Data.Staff(a).Named("Other");

        (await admin.StaffPageAsync(a.Id, "search=dev%00")).Items.Select(s => s.Id).ShouldBe([assistant.Id, a.Owner.Id]);
        (await admin.StaffPageAsync(a.Id, "search=%00")).TotalCount.ShouldBe(3);
    }

    [Fact]
    [Trait("Case", "ADM-205")]
    [Trait("Tier", "Smoke")]
    public async Task A_phone_that_is_staff_of_another_clinic_only_is_not_found()
    {
        var admin = await Login.SharedSuperAdminAsync();
        var a = await Data.Clinic();
        var b = await Data.Clinic();
        var other = await Data.Staff(b).Named("Only in B");

        (await admin.SearchStaffIdsAsync(a.Id, Unique.LocalPhone(other.Phone))).ShouldBeEmpty();
        (await admin.SearchStaffIdsAsync(a.Id, "Only in B")).ShouldBeEmpty();
        (await admin.StaffAsync(a.Id)).Select(s => s.Id).ShouldBe([a.Owner.Id]);
    }

    [Fact]
    [Trait("Case", "ADM-289")]
    public async Task The_name_search_folds_diacritics_hamza_yaa_and_taa_marbuta()
    {
        var admin = await Login.SharedSuperAdminAsync();
        var a = await Data.Clinic();
        var mona = await Data.Staff(a).Named("مُنَى عليّ");
        var ahmed = await Data.Staff(a).Named("أحمد إبراهيم");
        var fatma = await Data.Staff(a).Named("فاطمة الزهراء");

        (await admin.SearchStaffIdsAsync(a.Id, "مني علي")).ShouldBe([mona.Id]);
        (await admin.SearchStaffIdsAsync(a.Id, "ابراهيم")).ShouldBe([ahmed.Id]);
        (await admin.SearchStaffIdsAsync(a.Id, "فاطمه")).ShouldBe([fatma.Id]);
    }

    [Fact]
    public async Task Every_phone_form_and_part_of_the_name_finds_the_staff_member()
    {
        // Ported from accept-api.py "staff list/search"
        var admin = await Login.SharedSuperAdminAsync();
        var a = await Data.Clinic();
        var nour = await Data.Staff(a).Named("Nour Renamed");
        var phone = nour.Phone;
        var local = Unique.LocalPhone(phone);
        var arabic = string.Concat(local.Select(ch => (char)('٠' + (ch - '0'))));

        foreach (var term in new[]
                 {
                     "nour", "NOUR", local, phone, $"+20 {phone[3..6]} {phone[6..9]} {phone[9..]}", "00" + phone[1..], phone[3..], arabic,
                     $"({local[..3]}) {local[3..7]}-{local[7..]}", phone[^6..],
                 })
            (await admin.SearchStaffIdsAsync(a.Id, term)).ShouldContain(nour.Id, term);
        (await admin.SearchStaffIdsAsync(a.Id, "+20 " + local)).ShouldNotContain(nour.Id);
    }
}

/// <summary>
/// Adding, editing and removing staff (platform-admin business "الموظفون"; tech "Roles and staff (M1.5.3)": one row
/// per person per clinic, an existing user reused, at least one role of this clinic, the phone never changes, errors
/// in the form's order, 400 before 409).
/// </summary>
[Collection(AdminCollection6.Name)]
[Trait("Area", "admin")]
public class StaffChangeTests(AppFixture app) : IntegrationTest(app)
{
    private Task<int> StaffCountAsync(int clinicId) =>
        App.QueryDbAsync(db => db.Staff.IgnoreQueryFilters().CountAsync(s => s.ClinicId == clinicId));

    // ---- Add ----

    [Fact]
    [Trait("Case", "ADM-206")]
    [Trait("Tier", "Smoke")]
    public async Task A_new_phone_is_added_active_with_its_roles_and_one_new_user()
    {
        var admin = await Login.SharedSuperAdminAsync();
        var a = await Data.Clinic();
        var users = await App.UserCountAsync();

        var response = await admin.AddStaffAsync(a.Id, "01000000031", "New Person", a.RoleId(DefaultRoles.Assistant));

        await response.ShouldBeAsync(HttpStatusCode.Created);
        response.LocationPath().ShouldBe($"/api/v1/admin/clinics/{a.Id}/staff");
        var staff = await response.ReadAsync<StaffMemberDto>();
        staff.Phone.ShouldBe("+201000000031");
        staff.FullName.ShouldBe("New Person");
        staff.IsActive.ShouldBeTrue();
        staff.Roles.Select(r => (r.Id, r.Name, r.IsOwner)).ShouldBe([(a.RoleId(DefaultRoles.Assistant), "Assistant", false)]);
        (await App.UserCountAsync()).ShouldBe(users + 1);
    }

    [Fact]
    [Trait("Case", "ADM-286")]
    public async Task A_landline_staff_phone_is_accepted()
    {
        var admin = await Login.SharedSuperAdminAsync();
        var a = await Data.Clinic();

        (await admin.AddedStaffAsync(a.Id, "0223456780", "Landline", a.RoleId(DefaultRoles.Doctor))).Phone.ShouldBe("+20223456780");
    }

    [Fact]
    [Trait("Case", "ADM-207")]
    public async Task The_new_staff_member_logs_into_the_clinic_with_the_Assistants_permissions()
    {
        var admin = await Login.SharedSuperAdminAsync();
        var a = await Data.Clinic();
        var phone = Unique.Phone();
        await admin.AddedStaffAsync(a.Id, phone, "New Assistant", a.RoleId(DefaultRoles.Assistant));

        var browser = await Login.AsAsync(phone);

        browser.Auth.Context.ShouldNotBeNull();
        browser.Auth.Context.ClinicId.ShouldBe(a.Id);
        (await browser.MeAsync()).Permissions.ShouldBe(PermissionKeys.Assistant, ignoreOrder: true);
    }

    [Fact]
    [Trait("Case", "ADM-208")]
    public async Task Another_clinics_staff_member_is_added_with_the_same_user_and_keeps_their_name_there()
    {
        var admin = await Login.SharedSuperAdminAsync();
        var a = await Data.Clinic();
        var b = await Data.Clinic();
        var s = await Data.Staff(b).Named("Sara B");
        var users = await App.UserCountAsync();

        var added = await admin.AddedStaffAsync(a.Id, s.Phone, "Sara A", a.RoleId(DefaultRoles.Doctor));

        added.UserId.ShouldBe(s.UserId);
        added.FullName.ShouldBe("Sara A");
        (await App.UserCountAsync()).ShouldBe(users);
        (await admin.StaffAsync(b.Id)).Single(x => x.Id == s.Id).FullName.ShouldBe("Sara B");
    }

    [Fact]
    [Trait("Case", "ADM-209")]
    public async Task The_super_admins_phone_is_added_as_staff_and_keeps_the_platform_context()
    {
        var admin = await Login.SharedSuperAdminAsync();
        var a = await Data.Clinic();

        var added = await admin.AddedStaffAsync(a.Id, Login.SuperAdminPhone, "Super As Staff", a.RoleId(DefaultRoles.Assistant));

        var again = await Login.AsAsync(Login.SuperAdminPhone);
        again.Auth.Contexts.ShouldContain(c => c.Type == "platform");
        again.Auth.Contexts.ShouldContain(c => c.ClinicId == a.Id);
        await again.EnterPlatformAsync();
        await (await again.GetAsync(AdminRoutes.Clinics)).ShouldBeOkAsync();

        // Ported from accept-api.py "staff" (remove the super admin's staff row: the user and the platform rights stay)
        await (await admin.DeleteAsync(AdminRoutes.StaffMember(a.Id, added.Id))).ShouldBeAsync(HttpStatusCode.NoContent);
        await (await admin.DeleteAsync(AdminRoutes.StaffMember(a.Id, added.Id))).ShouldBeProblemAsync(HttpStatusCode.NotFound, "notFound");
        await (await admin.GetAsync(AdminRoutes.Clinics)).ShouldBeOkAsync();
        (await App.QueryDbAsync(db => db.Users.CountAsync(u => u.Phone == Login.SuperAdminPhone && u.IsSuperAdmin))).ShouldBe(1);
    }

    [Fact]
    [Trait("Case", "ADM-210")]
    public async Task An_active_staff_members_phone_in_any_format_is_refused_with_staffExists()
    {
        var admin = await Login.SharedSuperAdminAsync();
        var a = await Data.Clinic();
        var s = await Data.Staff(a);
        var count = await StaffCountAsync(a.Id);

        foreach (var phone in new[] { s.Phone, Unique.LocalPhone(s.Phone), "00" + s.Phone[1..], $"+20 {s.Phone[3..6]} {s.Phone[6..9]} {s.Phone[9..]}" })
            await (await admin.AddStaffAsync(a.Id, phone, "Again", a.RoleId(DefaultRoles.Assistant)))
                .ShouldBeProblemAsync(HttpStatusCode.Conflict, "staffExists");

        (await StaffCountAsync(a.Id)).ShouldBe(count);
    }

    [Fact]
    [Trait("Case", "ADM-211")]
    public async Task An_inactive_staff_members_phone_is_refused_with_staffExists()
    {
        var admin = await Login.SharedSuperAdminAsync();
        var a = await Data.Clinic();
        var s = await Data.Staff(a).Inactive();

        await (await admin.AddStaffAsync(a.Id, s.Phone, "Again", a.RoleId(DefaultRoles.Assistant)))
            .ShouldBeProblemAsync(HttpStatusCode.Conflict, "staffExists");
    }

    [Theory]
    [Trait("Case", "ADM-212")]
    [InlineData("123")]
    [InlineData("")]
    [InlineData(null)]
    public async Task An_invalid_phone_is_refused_on_phone(string phone)
    {
        var admin = await Login.SharedSuperAdminAsync();
        var a = await Data.Clinic();

        var problem = await (await admin.AddStaffAsync(a.Id, phone, "X", a.RoleId(DefaultRoles.Assistant)))
            .ShouldBeProblemAsync(HttpStatusCode.BadRequest, "invalidPhone");

        problem.Errors.Select(e => (e.Code, e.Field)).ShouldBe([("invalidPhone", "phone")]);
    }

    [Fact]
    [Trait("Case", "ADM-213")]
    public async Task The_full_name_follows_the_name_rules()
    {
        var admin = await Login.SharedSuperAdminAsync();
        var a = await Data.Clinic();
        var doctor = a.RoleId(DefaultRoles.Doctor);
        var name256 = new string('m', 256);

        (await (await admin.AddStaffAsync(a.Id, Unique.Phone(), "  ", doctor)).ShouldBeProblemAsync(HttpStatusCode.BadRequest, "nameRequired"))
            .ShouldHaveError("fullName", "nameRequired");
        (await admin.AddedStaffAsync(a.Id, Unique.Phone(), name256, doctor)).FullName.ShouldBe(name256);
        (await (await admin.AddStaffAsync(a.Id, Unique.Phone(), name256 + "m", doctor)).ShouldBeProblemAsync(HttpStatusCode.BadRequest, "nameTooLong"))
            .ShouldHaveError("fullName", "nameTooLong");
        (await (await admin.AddStaffAsync(a.Id, Unique.Phone(), "a\u0000b", doctor)).ShouldBeProblemAsync(HttpStatusCode.BadRequest, "nameInvalid"))
            .ShouldHaveError("fullName", "nameInvalid");
        (await (await admin.AddStaffAsync(a.Id, Unique.Phone(), "a\u202Eb", doctor)).ShouldBeProblemAsync(HttpStatusCode.BadRequest, "nameInvalid"))
            .ShouldHaveError("fullName", "nameInvalid");
    }

    [Fact]
    [Trait("Case", "ADM-214")]
    public async Task At_least_one_role_is_required()
    {
        var admin = await Login.SharedSuperAdminAsync();
        var a = await Data.Clinic();

        (await (await admin.AddStaffAsync(a.Id, Unique.Phone(), "X")).ShouldBeProblemAsync(HttpStatusCode.BadRequest, "rolesRequired"))
            .Errors.Select(e => (e.Code, e.Field)).ShouldBe([("rolesRequired", "roleIds")]);
        (await (await admin.PostAsync(AdminRoutes.Staff(a.Id), new { phone = Unique.Phone(), fullName = "X" }))
            .ShouldBeProblemAsync(HttpStatusCode.BadRequest, "rolesRequired")).ShouldHaveError("roleIds", "rolesRequired");
    }

    [Fact]
    [Trait("Case", "ADM-215")]
    public async Task A_repeated_role_id_gives_one_role()
    {
        var admin = await Login.SharedSuperAdminAsync();
        var a = await Data.Clinic();
        var assistant = a.RoleId(DefaultRoles.Assistant);

        var added = await admin.AddedStaffAsync(a.Id, Unique.LocalPhone(Unique.Phone()), "  Nour Test  ", assistant, assistant);

        added.Roles.Select(r => r.Name).ShouldBe(["Assistant"]);
        added.FullName.ShouldBe("Nour Test");
        (await App.QueryDbAsync(db => db.StaffRoles.IgnoreQueryFilters().CountAsync(r => r.StaffId == added.Id))).ShouldBe(1);
    }

    [Fact]
    [Trait("Case", "ADM-216")]
    [Trait("Case", "ADM-220")]
    public async Task An_unknown_or_another_clinics_role_is_refused_with_roleNotFound_and_nothing_is_written()
    {
        var admin = await Login.SharedSuperAdminAsync();
        var a = await Data.Clinic();
        var b = await Data.Clinic();
        var deleted = await Data.Role(a);
        await Data.DeleteRoleAsync(a, deleted.Id);
        var before = await App.RowCountsAsync();

        foreach (var roleIds in new[] { new[] { 999_999 }, [b.RoleId(DefaultRoles.Owner)], [a.RoleId(DefaultRoles.Assistant), 999_999], [deleted.Id] })
        {
            var phone = Unique.Phone();
            var problem = await (await admin.AddStaffAsync(a.Id, phone, "X", roleIds)).ShouldBeProblemAsync(HttpStatusCode.BadRequest, "roleNotFound");
            problem.Errors.Select(e => (e.Code, e.Field)).ShouldBe([("roleNotFound", "roleIds")]);
            (await App.QueryDbAsync(db => db.Users.CountAsync(u => u.Phone == phone))).ShouldBe(0);
        }

        (await App.RowCountsAsync()).ShouldBe(before);
    }

    [Fact]
    [Trait("Case", "ADM-217")]
    public async Task A_bad_role_is_reported_before_staffExists()
    {
        var admin = await Login.SharedSuperAdminAsync();
        var a = await Data.Clinic();
        var b = await Data.Clinic();
        var s = await Data.Staff(a);

        await (await admin.AddStaffAsync(a.Id, s.Phone, "X", b.RoleId(DefaultRoles.Owner))).ShouldBeProblemAsync(HttpStatusCode.BadRequest, "roleNotFound");
    }

    [Fact]
    [Trait("Case", "ADM-218")]
    public async Task A_role_id_that_is_not_a_number_is_refused_with_invalidRequest()
    {
        var admin = await Login.SharedSuperAdminAsync();
        var a = await Data.Clinic();

        await (await admin.SendRawAsync(HttpMethod.Post, AdminRoutes.Staff(a.Id), "{\"phone\":\"01100000000\",\"fullName\":\"X\",\"roleIds\":[\"a\"]}"))
            .ShouldBeProblemAsync(HttpStatusCode.BadRequest, "invalidRequest");
    }

    [Fact]
    [Trait("Case", "ADM-219")]
    public async Task Every_error_is_returned_in_the_forms_order()
    {
        var admin = await Login.SharedSuperAdminAsync();
        var a = await Data.Clinic();

        var problem = await (await admin.AddStaffAsync(a.Id, "123", "")).ShouldBeProblemAsync(HttpStatusCode.BadRequest, "invalidPhone");

        problem.Errors.Select(e => (e.Code, e.Field)).ShouldBe([("invalidPhone", "phone"), ("nameRequired", "fullName"), ("rolesRequired", "roleIds")]);
    }

    [Fact]
    [Trait("Case", "ADM-220")]
    public async Task No_user_row_is_created_when_the_add_is_refused()
    {
        var admin = await Login.SharedSuperAdminAsync();
        var a = await Data.Clinic();
        var s = await Data.Staff(a);
        var users = await App.UserCountAsync();

        await (await admin.AddStaffAsync(a.Id, Unique.Phone(), "X", 999_999)).ShouldBeProblemAsync(HttpStatusCode.BadRequest, "roleNotFound");
        await (await admin.AddStaffAsync(a.Id, s.Phone, "X", a.RoleId(DefaultRoles.Doctor))).ShouldBeProblemAsync(HttpStatusCode.Conflict, "staffExists");

        (await App.UserCountAsync()).ShouldBe(users);
    }

    // ---- Update ----

    [Fact]
    [Trait("Case", "ADM-221")]
    [Trait("Tier", "Smoke")]
    public async Task An_update_changes_the_name_the_active_flag_and_the_roles_here_only()
    {
        var admin = await Login.SharedSuperAdminAsync();
        var a = await Data.Clinic();
        var b = await Data.Clinic();
        var editors = await Data.Role(a).Named("Editors");
        var s = await Data.Staff(a).Named("Sara").WithRole(DefaultRoles.Doctor);
        var inB = await Data.Staff(b).WithPhone(s.Phone).Named("Sara in B");

        var response = await admin.UpdateStaffAsync(a.Id, s.Id, "  Sara Renamed ", false, editors.Id, a.RoleId(DefaultRoles.Assistant));

        await response.ShouldBeOkAsync();
        var updated = await response.ReadAsync<StaffMemberDto>();
        updated.FullName.ShouldBe("Sara Renamed");
        updated.IsActive.ShouldBeFalse();
        updated.Roles.Select(r => r.Name).ShouldBe(["Assistant", "Editors"]);
        updated.Phone.ShouldBe(s.Phone);
        (await admin.StaffAsync(a.Id)).Single(x => x.Id == s.Id).ShouldBeEquivalentTo(updated);
        (await admin.StaffAsync(b.Id)).Single(x => x.Id == inB.Id).FullName.ShouldBe("Sara in B");
    }

    [Fact]
    [Trait("Case", "ADM-222")]
    public async Task An_update_without_isActive_is_refused_and_never_deactivates()
    {
        var admin = await Login.SharedSuperAdminAsync();
        var a = await Data.Clinic();
        var s = await Data.Staff(a);

        var problem = await (await admin.PutAsync(AdminRoutes.StaffMember(a.Id, s.Id), new { fullName = "N", roleIds = new[] { a.RoleId(DefaultRoles.Doctor) } }))
            .ShouldBeProblemAsync(HttpStatusCode.BadRequest, "invalidRequest");
        problem.Errors.Select(e => (e.Code, e.Field)).ShouldBe([("invalidRequest", "isActive")]);
        await (await admin.PutAsync(AdminRoutes.StaffMember(a.Id, s.Id), new { fullName = "N", isActive = (bool?)null, roleIds = new[] { a.RoleId(DefaultRoles.Doctor) } }))
            .ShouldBeProblemAsync(HttpStatusCode.BadRequest, "invalidRequest");

        var after = (await admin.StaffAsync(a.Id)).Single(x => x.Id == s.Id);
        after.IsActive.ShouldBeTrue();
        after.FullName.ShouldBe(s.FullName);
    }

    [Fact]
    [Trait("Case", "ADM-223")]
    public async Task A_phone_sent_with_an_update_is_ignored()
    {
        var admin = await Login.SharedSuperAdminAsync();
        var a = await Data.Clinic();
        var s = await Data.Staff(a);

        var response = await admin.PutAsync(AdminRoutes.StaffMember(a.Id, s.Id),
            new { fullName = "Same", isActive = true, roleIds = new[] { a.RoleId(DefaultRoles.Doctor) }, phone = "+201199999999" });

        await response.ShouldBeOkAsync();
        (await response.ReadAsync<StaffMemberDto>()).Phone.ShouldBe(s.Phone);
        (await admin.StaffAsync(a.Id)).Single(x => x.Id == s.Id).Phone.ShouldBe(s.Phone);
    }

    [Fact]
    [Trait("Case", "ADM-224")]
    public async Task An_update_with_another_clinics_role_is_refused_with_roleNotFound()
    {
        var admin = await Login.SharedSuperAdminAsync();
        var a = await Data.Clinic();
        var b = await Data.Clinic();
        var s = await Data.Staff(a);

        await (await admin.UpdateStaffAsync(a.Id, s.Id, "N", true, b.RoleId(DefaultRoles.Owner))).ShouldBeProblemAsync(HttpStatusCode.BadRequest, "roleNotFound");
        // Ported from accept-api.py "staff" (update rolesRequired, nameRequired)
        await (await admin.UpdateStaffAsync(a.Id, s.Id, "N", true)).ShouldBeProblemAsync(HttpStatusCode.BadRequest, "rolesRequired");
        await (await admin.UpdateStaffAsync(a.Id, s.Id, "", true, a.RoleId(DefaultRoles.Doctor))).ShouldBeProblemAsync(HttpStatusCode.BadRequest, "nameRequired");

        (await admin.StaffAsync(a.Id)).Single(x => x.Id == s.Id).Roles.Select(r => r.Name).ShouldBe(["Doctor"]);
    }

    [Fact]
    [Trait("Case", "ADM-225")]
    public async Task An_unknown_staff_id_is_notFound_and_a_second_remove_too()
    {
        var admin = await Login.SharedSuperAdminAsync();
        var a = await Data.Clinic();
        var s = await Data.Staff(a);

        await (await admin.UpdateStaffAsync(a.Id, 999_999, "N", true, a.RoleId(DefaultRoles.Doctor))).ShouldBeProblemAsync(HttpStatusCode.NotFound, "notFound");
        await (await admin.DeleteAsync(AdminRoutes.StaffMember(a.Id, 999_999))).ShouldBeProblemAsync(HttpStatusCode.NotFound, "notFound");
        await (await admin.DeleteAsync(AdminRoutes.StaffMember(a.Id, s.Id))).ShouldBeAsync(HttpStatusCode.NoContent);
        await (await admin.DeleteAsync(AdminRoutes.StaffMember(a.Id, s.Id))).ShouldBeProblemAsync(HttpStatusCode.NotFound, "notFound");
    }

    [Fact]
    public async Task Another_clinics_staff_id_is_notFound_and_that_staff_member_is_untouched()
    {
        // Ported from accept-api.py "staff" (other clinic's staff PUT/DELETE)
        var admin = await Login.SharedSuperAdminAsync();
        var a = await Data.Clinic();
        var b = await Data.Clinic();
        var before = await admin.StaffAsync(b.Id);

        await (await admin.UpdateStaffAsync(a.Id, b.Owner.Id, "Stolen", false, a.RoleId(DefaultRoles.Doctor)))
            .ShouldBeProblemAsync(HttpStatusCode.NotFound, "notFound");
        await (await admin.DeleteAsync(AdminRoutes.StaffMember(a.Id, b.Owner.Id))).ShouldBeProblemAsync(HttpStatusCode.NotFound, "notFound");

        (await admin.StaffAsync(b.Id)).ShouldBeEquivalentTo(before);
    }

    // ---- Remove and add again ----

    [Fact]
    [Trait("Case", "ADM-226")]
    public async Task Removing_from_one_clinic_keeps_the_user_and_the_other_clinic()
    {
        var admin = await Login.SharedSuperAdminAsync();
        var a = await Data.Clinic();
        var b = await Data.Clinic();
        var s = await Data.Staff(a);
        var inB = await Data.Staff(b).WithPhone(s.Phone);
        var bBefore = await admin.StaffAsync(b.Id);

        await (await admin.DeleteAsync(AdminRoutes.StaffMember(a.Id, s.Id))).ShouldBeAsync(HttpStatusCode.NoContent);

        (await admin.StaffAsync(a.Id)).ShouldNotContain(x => x.Id == s.Id);
        (await App.QueryDbAsync(db => db.Staff.IgnoreQueryFilters().CountAsync(x => x.Id == s.Id))).ShouldBe(0);
        (await App.QueryDbAsync(db => db.Users.CountAsync(u => u.Id == s.UserId))).ShouldBe(1);
        (await admin.StaffAsync(b.Id)).ShouldBeEquivalentTo(bBefore);
        var browser = await Login.AsAsync(s.Phone);
        browser.Auth.Context.ShouldNotBeNull();
        browser.Auth.Context.ClinicId.ShouldBe(b.Id);
        browser.Auth.Context.ShouldNotBeNull();
        (await browser.MeAsync()).Staff.Id.ShouldBe(inB.Id);
    }

    [Fact]
    [Trait("Case", "ADM-227")]
    public async Task Added_again_after_removal_gets_a_new_id_and_the_old_token_works_only_after_a_refresh()
    {
        var admin = await Login.SharedSuperAdminAsync();
        var a = await Data.Clinic();
        var doctor = a.RoleId(DefaultRoles.Doctor);
        var s = await Data.Staff(a).WithRole(DefaultRoles.Doctor);
        var browser = await Login.StaffAsync(s);
        await (await browser.GetAsync("/api/v1/drugs")).ShouldBeOkAsync();

        await (await admin.DeleteAsync(AdminRoutes.StaffMember(a.Id, s.Id))).ShouldBeAsync(HttpStatusCode.NoContent);
        var again = await admin.AddedStaffAsync(a.Id, Unique.LocalPhone(s.Phone), s.FullName, doctor, doctor);

        again.Id.ShouldNotBe(s.Id);
        again.UserId.ShouldBe(s.UserId);
        again.Roles.Select(r => r.Name).ShouldBe(["Doctor"]);
        await (await browser.GetAsync("/api/v1/drugs")).ShouldBeProblemAsync(HttpStatusCode.Forbidden, "noAccess");
        await (await browser.RefreshAsync()).ShouldBeOkAsync();
        browser.Auth.Context.ShouldNotBeNull();
        browser.Auth.Context.ClinicId.ShouldBe(a.Id);
        await (await browser.GetAsync("/api/v1/drugs")).ShouldBeOkAsync();
    }

    [Fact]
    [Trait("Case", "ADM-228")]
    public async Task Each_staff_change_shows_at_once_in_the_counts_and_the_owners()
    {
        var admin = await Login.SharedSuperAdminAsync();
        var a = await Data.Clinic();
        var ownerRole = a.RoleId(DefaultRoles.Owner);
        async Task ShouldShowAsync(int staffCount, int owners, int ownerHolders)
        {
            var details = await admin.ClinicAsync(a.Id);
            details.StaffCount.ShouldBe(staffCount);
            details.Owners.Count.ShouldBe(owners);
            (await admin.ListClinicsAsync($"search={Uri.EscapeDataString(a.Name)}")).Items.Single().StaffCount.ShouldBe(staffCount);
            (await admin.RolesAsync(a.Id)).Single(r => r.Id == ownerRole).StaffCount.ShouldBe(ownerHolders);
        }
        await ShouldShowAsync(1, 1, 1);

        var p = await admin.AddedStaffAsync(a.Id, Unique.Phone(), "Second Owner", ownerRole);
        await ShouldShowAsync(2, 2, 2);
        await (await admin.UpdateStaffAsync(a.Id, p.Id, "Second Owner", false, ownerRole)).ShouldBeOkAsync();
        await ShouldShowAsync(1, 1, 2);
        await (await admin.DeleteAsync(AdminRoutes.StaffMember(a.Id, p.Id))).ShouldBeAsync(HttpStatusCode.NoContent);
        await ShouldShowAsync(1, 1, 1);
    }
}

/// <summary>
/// The last active owner (platform-admin business "الموظفون": a clinic always keeps one active Owner; tech
/// <c>lastOwner</c>: only a staff member who is an active Owner today may get it; inactive owners don't count).
/// </summary>
[Collection(AdminCollection6.Name)]
[Trait("Area", "admin")]
public class LastOwnerTests(AppFixture app) : IntegrationTest(app)
{
    private async Task<(ClinicHandle Clinic, ApiClient Admin)> ClinicWithOneOwnerAsync() =>
        (await Data.Clinic().OwnedBy(Unique.Phone(), "First Owner"), await Login.SharedSuperAdminAsync());

    private static async Task OwnerStaysAsync(ApiClient admin, ClinicHandle clinic)
    {
        var owner = (await admin.StaffAsync(clinic.Id)).Single(s => s.Id == clinic.Owner.Id);
        owner.IsActive.ShouldBeTrue();
        owner.Roles.ShouldContain(r => r.IsOwner);
        (await admin.ClinicAsync(clinic.Id)).Owners.ShouldContain(o => o.StaffId == clinic.Owner.Id);
    }

    [Fact]
    [Trait("Case", "ADM-229")]
    [Trait("Tier", "Smoke")]
    public async Task The_only_active_owner_cannot_be_deactivated()
    {
        var (a, admin) = await ClinicWithOneOwnerAsync();

        await (await admin.UpdateStaffAsync(a.Id, a.Owner.Id, "First Owner", false, a.RoleId(DefaultRoles.Owner)))
            .ShouldBeProblemAsync(HttpStatusCode.Conflict, "lastOwner");

        await OwnerStaysAsync(admin, a);
    }

    [Fact]
    [Trait("Case", "ADM-230")]
    public async Task The_only_active_owner_cannot_be_removed()
    {
        var (a, admin) = await ClinicWithOneOwnerAsync();

        await (await admin.DeleteAsync(AdminRoutes.StaffMember(a.Id, a.Owner.Id))).ShouldBeProblemAsync(HttpStatusCode.Conflict, "lastOwner");

        await OwnerStaysAsync(admin, a);
    }

    [Fact]
    [Trait("Case", "ADM-231")]
    public async Task The_Owner_role_cannot_be_taken_from_the_only_active_owner()
    {
        var (a, admin) = await ClinicWithOneOwnerAsync();

        await (await admin.UpdateStaffAsync(a.Id, a.Owner.Id, "First Owner", true, a.RoleId(DefaultRoles.Doctor)))
            .ShouldBeProblemAsync(HttpStatusCode.Conflict, "lastOwner");

        await OwnerStaysAsync(admin, a);
    }

    [Fact]
    [Trait("Case", "ADM-232")]
    public async Task The_only_active_owner_may_get_another_role_and_a_new_name()
    {
        var (a, admin) = await ClinicWithOneOwnerAsync();

        var response = await admin.UpdateStaffAsync(a.Id, a.Owner.Id, "First Owner", true, a.RoleId(DefaultRoles.Doctor), a.RoleId(DefaultRoles.Owner));

        await response.ShouldBeOkAsync();
        (await response.ReadAsync<StaffMemberDto>()).Roles.Select(r => r.Name).ShouldBe(["Owner", "Doctor"]);
        // Ported from accept-api.py "lastOwner" (only owner renamed → 200)
        await (await admin.UpdateStaffAsync(a.Id, a.Owner.Id, "Renamed Owner", true, a.RoleId(DefaultRoles.Owner))).ShouldBeOkAsync();
    }

    [Fact]
    [Trait("Case", "ADM-233")]
    public async Task An_inactive_second_owner_does_not_count()
    {
        var (a, admin) = await ClinicWithOneOwnerAsync();
        await Data.Staff(a).Named("Second Owner").WithRole(DefaultRoles.Owner).Inactive();

        await (await admin.DeleteAsync(AdminRoutes.StaffMember(a.Id, a.Owner.Id))).ShouldBeProblemAsync(HttpStatusCode.Conflict, "lastOwner");
        await (await admin.UpdateStaffAsync(a.Id, a.Owner.Id, "First Owner", false, a.RoleId(DefaultRoles.Owner)))
            .ShouldBeProblemAsync(HttpStatusCode.Conflict, "lastOwner");
        await (await admin.UpdateStaffAsync(a.Id, a.Owner.Id, "First Owner", true, a.RoleId(DefaultRoles.Doctor)))
            .ShouldBeProblemAsync(HttpStatusCode.Conflict, "lastOwner");

        await OwnerStaysAsync(admin, a);
    }

    [Fact]
    [Trait("Case", "ADM-234")]
    public async Task With_two_active_owners_either_may_be_deactivated_removed_or_lose_the_Owner_role()
    {
        var admin = await Login.SharedSuperAdminAsync();

        var deactivate = await Data.Clinic();
        var p1 = await Data.Staff(deactivate).WithRole(DefaultRoles.Owner);
        await (await admin.UpdateStaffAsync(deactivate.Id, p1.Id, p1.FullName, false, deactivate.RoleId(DefaultRoles.Owner))).ShouldBeOkAsync();

        var remove = await Data.Clinic();
        var p2 = await Data.Staff(remove).WithRole(DefaultRoles.Owner);
        await (await admin.DeleteAsync(AdminRoutes.StaffMember(remove.Id, p2.Id))).ShouldBeAsync(HttpStatusCode.NoContent);

        var takeAway = await Data.Clinic();
        var p3 = await Data.Staff(takeAway).WithRole(DefaultRoles.Owner);
        await (await admin.UpdateStaffAsync(takeAway.Id, p3.Id, p3.FullName, true, takeAway.RoleId(DefaultRoles.Doctor))).ShouldBeOkAsync();

        // The first owner too, while the second is still an active owner (accept-api.py "lastOwner")
        var first = await Data.Clinic();
        await Data.Staff(first).WithRole(DefaultRoles.Owner);
        await (await admin.UpdateStaffAsync(first.Id, first.Owner.Id, first.Owner.FullName, false, first.RoleId(DefaultRoles.Owner))).ShouldBeOkAsync();
        (await admin.ClinicAsync(first.Id)).Owners.ShouldNotContain(o => o.StaffId == first.Owner.Id);
    }

    [Fact]
    [Trait("Case", "ADM-235")]
    public async Task Removing_an_inactive_owner_never_answers_lastOwner()
    {
        var (a, admin) = await ClinicWithOneOwnerAsync();
        var p = await Data.Staff(a).Named("Second Owner").WithRole(DefaultRoles.Owner).Inactive();

        await (await admin.DeleteAsync(AdminRoutes.StaffMember(a.Id, p.Id))).ShouldBeAsync(HttpStatusCode.NoContent);
    }

    [Fact]
    public async Task Changes_to_someone_who_is_not_an_active_owner_never_answer_lastOwner()
    {
        // Ported from accept-api.py "lastOwner" (non-owner deactivated; details staffCount = active staff)
        var (a, admin) = await ClinicWithOneOwnerAsync();
        var plain = await Data.Staff(a).Named("Plain").WithRole(DefaultRoles.Doctor);

        await (await admin.UpdateStaffAsync(a.Id, plain.Id, "Plain", false, a.RoleId(DefaultRoles.Doctor))).ShouldBeOkAsync();
        await (await admin.DeleteAsync(AdminRoutes.StaffMember(a.Id, plain.Id))).ShouldBeAsync(HttpStatusCode.NoContent);

        var details = await admin.ClinicAsync(a.Id);
        details.StaffCount.ShouldBe(1);
        details.Owners.Select(o => o.FullName).ShouldBe(["First Owner"]);
    }
}
