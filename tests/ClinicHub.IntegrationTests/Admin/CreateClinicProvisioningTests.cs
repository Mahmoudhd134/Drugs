using System.Net;
using System.Text.Json;
using ClinicHub.Application.Features.Access.StaffMembers;
using ClinicHub.Application.Features.Catalog.DrugGroups;
using ClinicHub.Application.Features.Catalog.Drugs;
using ClinicHub.Application.Features.Identity.Sessions;
using ClinicHub.Application.Features.Platform.Clinics;
using ClinicHub.Application.Features.Platform.Provisioning;
using ClinicHub.Domain.Access;
using ClinicHub.IntegrationTests.Harness.Assertions;
using ClinicHub.IntegrationTests.Harness.Builders;
using ClinicHub.IntegrationTests.Harness.Clients;
using ClinicHub.IntegrationTests.Harness.Hosting;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Shouldly;

namespace ClinicHub.IntegrationTests.Admin;

/// <summary>Creating a clinic through the API.</summary>
public static class CreateClinicApi
{
    public static async Task<(ClinicDetails Details, HttpResponseMessage Response)> CreateClinicAsync(this ApiClient admin,
        string name, string phone, string fullName)
    {
        var response = await admin.PostAsync(AdminRoutes.Clinics, new { name, owner = new { phone, fullName } });
        await response.ShouldBeAsync(HttpStatusCode.Created);
        return (await response.ReadAsync<ClinicDetails>(), response);
    }

    public static async Task<ClinicDetails> CreateClinicAsync(this ApiClient admin, string phone = null, string fullName = "Owner") =>
        (await admin.CreateClinicAsync(Unique.Name("Clinic", "عيادة"), phone ?? Unique.Phone(), fullName)).Details;

    /// <summary>The path of a <c>Location</c> header (relative or absolute).</summary>
    public static string LocationPath(this HttpResponseMessage response)
    {
        response.Headers.Location.ShouldNotBeNull();
        var location = response.Headers.Location;
        return location.IsAbsoluteUri ? location.AbsolutePath : location.OriginalString;
    }
}

/// <summary>
/// Provisioning a new clinic from the template (platform-admin business "سيناريوهات الاستخدام" 1; tech "Provisioning";
/// design M1.5 D5): default roles, the owner, a snapshot copy of the template's drugs and groups, all or nothing.
/// </summary>
[Collection(AdminCollection3.Name)]
[Trait("Area", "admin")]
public class CreateClinicProvisioningTests(AppFixture app) : IntegrationTest(app)
{
    private Task<TemplateCatalog> TemplateAsync() => App.PerClassAsync("template", () => TemplateCatalog.CreateAsync(App));

    private Task<ApiClient> InTemplateAsync() => Login.SharedAsync("template", Login.SuperAdminInTemplateAsync);

    private static string Json(object value) => JsonSerializer.Serialize(value, Harness.Assertions.Json.Options);

    private static string DrugContent(DrugDto drug) => Json(new { drug.Name, drug.Description, drug.DefaultDosing });

    private static string GroupContent(DrugGroupDto group) =>
        Json(new { group.Name, Items = group.Items.Select(i => new { Drug = i.Drug.Name, i.Dosing }) });

    [Fact]
    [Trait("Case", "ADM-066")]
    [Trait("Tier", "Smoke")]
    public async Task A_created_clinic_answers_201_with_its_location_trimmed_names_and_its_owner()
    {
        var admin = await Login.SharedSuperAdminAsync();

        var (details, response) = await admin.CreateClinicAsync("  Smoke clinic  ", "01000000009", " Smoke Owner ");

        response.LocationPath().ShouldBe($"/api/v1/admin/clinics/{details.Id}");
        details.Name.ShouldBe("Smoke clinic");
        details.Status.ShouldBe("active");
        details.StaffCount.ShouldBe(1);
        details.Owners.Select(o => (o.FullName, o.Phone)).ShouldBe([("Smoke Owner", "+201000000009")]);
    }

    [Fact]
    [Trait("Case", "ADM-067")]
    public async Task A_new_clinic_has_the_Owner_Doctor_and_Assistant_roles()
    {
        var admin = await Login.SharedSuperAdminAsync();
        var clinic = await admin.CreateClinicAsync();

        var roles = await admin.RolesAsync(clinic.Id);

        roles.Select(r => (r.Name, r.IsOwner, r.StaffCount)).ShouldBe([("Owner", true, 1), ("Assistant", false, 0), ("Doctor", false, 0)]);
        roles[0].Permissions.ShouldBe(PermissionKeys.CatalogOrder);
        roles[1].Permissions.ShouldBe(PermissionKeys.Assistant);
        roles[2].Permissions.ShouldBe(PermissionKeys.CatalogOrder);
    }

    [Fact]
    [Trait("Case", "ADM-068")]
    public async Task A_new_phone_gets_one_new_user_whose_staff_row_is_active_with_only_the_Owner_role()
    {
        var admin = await Login.SharedSuperAdminAsync();
        var users = await App.UserCountAsync();
        var phone = Unique.Phone();

        var clinic = await admin.CreateClinicAsync(phone, "New Owner");

        (await App.UserCountAsync()).ShouldBe(users + 1);
        var staff = (await admin.StaffAsync(clinic.Id)).ShouldHaveSingleItem();
        staff.Phone.ShouldBe(phone);
        staff.FullName.ShouldBe("New Owner");
        staff.IsActive.ShouldBeTrue();
        staff.Roles.Select(r => (r.Name, r.IsOwner)).ShouldBe([("Owner", true)]);
        (await App.QueryDbAsync(db => db.Users.CountAsync(u => u.Phone == phone))).ShouldBe(1);
    }

    [Fact]
    public async Task A_create_adds_one_clinic_user_staff_three_roles_and_the_template_copy()
    {
        // Ported from accept-api.py "create clinic" (row deltas) and "roles" (the Owner stores no permission rows)
        var admin = await Login.SharedSuperAdminAsync();
        await TemplateAsync();
        var before = await App.RowCountsAsync();

        var clinic = await admin.CreateClinicAsync();

        var after = await App.RowCountsAsync();
        (after.Clinics - before.Clinics, after.Users - before.Users, after.Staff - before.Staff, after.Roles - before.Roles,
            after.RolePermissions - before.RolePermissions, after.StaffRoles - before.StaffRoles, after.Drugs - before.Drugs,
            after.Groups - before.Groups, after.GroupItems - before.GroupItems).ShouldBe((1, 1, 1, 3, 11 + 9, 1, 2, 1, 2));
        (await App.QueryDbAsync(db => db.Set<RolePermission>().CountAsync(p =>
            db.Roles.IgnoreQueryFilters().Any(r => r.Id == p.RoleId && r.ClinicId == clinic.Id && r.IsOwner)))).ShouldBe(0);
    }

    [Fact]
    [Trait("Case", "ADM-069")]
    [Trait("Tier", "Smoke")]
    public async Task The_new_owner_logs_straight_into_the_clinic_with_every_permission()
    {
        var admin = await Login.SharedSuperAdminAsync();
        var phone = Unique.Phone();
        var clinic = await admin.CreateClinicAsync(phone);

        var owner = await Login.AsAsync(phone);

        owner.Auth.Context.ShouldNotBeNull();
        owner.Auth.Context.ClinicId.ShouldBe(clinic.Id);
        owner.Auth.Contexts.ShouldHaveSingleItem();
        (await owner.MeAsync()).Permissions.ShouldBe(PermissionKeys.CatalogOrder, ignoreOrder: true);
    }

    [Fact]
    [Trait("Case", "ADM-070")]
    [Trait("Case", "ADM-071")]
    public async Task The_new_clinic_gets_a_copy_of_the_templates_drugs_and_group_with_the_line_override()
    {
        var template = await TemplateAsync();
        var admin = await Login.SharedSuperAdminAsync();
        var inTemplate = await InTemplateAsync();
        var phone = Unique.Phone();
        await admin.CreateClinicAsync(phone);
        var owner = await Login.AsAsync(phone);

        var drugs = (await owner.DrugsAsync()).Items;
        var groups = await owner.GroupsAsync();

        drugs.Select(DrugContent).ShouldBe((await inTemplate.DrugsAsync()).Items.Select(DrugContent), ignoreOrder: true);
        drugs.Select(DrugContent).ShouldBe([DrugContent(template.First), DrugContent(template.Second)], ignoreOrder: true);
        drugs.Single(d => d.Name == template.Second.Name).DefaultDosing.TaperSteps.Count.ShouldBe(3);
        var group = groups.ShouldHaveSingleItem();
        GroupContent(group).ShouldBe(GroupContent(template.Group));
        group.Items.Select(i => i.Drug.Name).ShouldBe([template.First.Name, template.Second.Name]);
        group.Items[0].Dosing.ShouldBeNull();
        var line2 = group.Items[1].Dosing;
        line2.ShouldNotBeNull();
        line2.Eye.ShouldBe("ask");
        line2.DoseAmount.ShouldBeNull("the dose comes from the drug");
        line2.TaperSteps.Select(s => s.FrequencyValue).ShouldBe([4, 3, 2, 1]);
        Json(line2).ShouldBe(Json(template.Group.Items[1].Dosing));
    }

    [Fact]
    [Trait("Case", "ADM-072")]
    public async Task The_copied_lines_point_to_the_clinics_own_drugs_and_the_template_is_unchanged()
    {
        var template = await TemplateAsync();
        var admin = await Login.SharedSuperAdminAsync();
        var inTemplate = await InTemplateAsync();
        var templateDrugsBefore = (await inTemplate.DrugsAsync()).Items.Select(d => Json(d)).ToList();
        var templateGroupsBefore = (await inTemplate.GroupsAsync()).Select(g => Json(g)).ToList();
        var phone = Unique.Phone();
        await admin.CreateClinicAsync(phone);
        var owner = await Login.AsAsync(phone);

        var ownDrugIds = (await owner.DrugsAsync()).Items.Select(d => d.Id).ToList();
        var group = (await owner.GroupsAsync()).Single();

        group.Id.ShouldNotBe(template.Group.Id);
        group.Items.ShouldAllBe(i => ownDrugIds.Contains(i.Drug.Id));
        group.Items.ShouldAllBe(i => i.Drug.Id != template.First.Id && i.Drug.Id != template.Second.Id);
        (await inTemplate.DrugsAsync()).Items.Select(d => Json(d)).ShouldBe(templateDrugsBefore);
        (await inTemplate.GroupsAsync()).Select(g => Json(g)).ShouldBe(templateGroupsBefore);
    }

    [Fact]
    [Trait("Case", "ADM-074")]
    public async Task A_clinics_edits_and_deletes_reach_neither_the_template_nor_another_clinic()
    {
        await TemplateAsync();
        var admin = await Login.SharedSuperAdminAsync();
        var inTemplate = await InTemplateAsync();
        var phoneA = Unique.Phone();
        var phoneB = Unique.Phone();
        await admin.CreateClinicAsync(phoneA);
        await admin.CreateClinicAsync(phoneB);
        var ownerA = await Login.AsAsync(phoneA);
        var ownerB = await Login.AsAsync(phoneB);
        var templateDrugs = (await inTemplate.DrugsAsync()).Items.Select(d => Json(d)).ToList();
        var templateGroups = (await inTemplate.GroupsAsync()).Select(g => Json(g)).ToList();
        var otherDrugs = (await ownerB.DrugsAsync()).Items.Select(d => Json(d)).ToList();
        var otherGroups = (await ownerB.GroupsAsync()).Select(g => Json(g)).ToList();
        var drugs = (await ownerA.DrugsAsync()).Items;
        var group = (await ownerA.GroupsAsync()).Single();

        await (await ownerA.PutAsync($"/api/v1/drugs/{drugs[0].Id}", new
        {
            name = drugs[0].Name + " CLINIC", description = "Edited", defaultDosing = drugs[0].DefaultDosing,
        })).ShouldBeOkAsync();
        await (await ownerA.PutAsync($"/api/v1/drug-groups/{group.Id}", new
        {
            name = group.Name + " CLINIC", items = group.Items.Take(1).Select(i => new { drugId = i.Drug.Id, dosing = i.Dosing }),
        })).ShouldBeOkAsync();
        await (await ownerA.DeleteAsync($"/api/v1/drug-groups/{group.Id}")).ShouldBeAsync(HttpStatusCode.NoContent);
        await (await ownerA.DeleteAsync($"/api/v1/drugs/{drugs[1].Id}")).ShouldBeAsync(HttpStatusCode.NoContent);

        (await inTemplate.DrugsAsync()).Items.Select(d => Json(d)).ShouldBe(templateDrugs);
        (await inTemplate.GroupsAsync()).Select(g => Json(g)).ShouldBe(templateGroups);
        (await ownerB.DrugsAsync()).Items.Select(d => Json(d)).ShouldBe(otherDrugs);
        (await ownerB.GroupsAsync()).Select(g => Json(g)).ShouldBe(otherGroups);
    }

    [Fact]
    [Trait("Case", "ADM-078")]
    public async Task An_existing_staff_phone_becomes_the_owner_with_no_new_user_and_keeps_its_name_elsewhere()
    {
        var admin = await Login.SharedSuperAdminAsync();
        var a = await Data.Clinic();
        var s = await Data.Staff(a).Named("Dev Assistant").WithRole("Assistant");
        var users = await App.UserCountAsync();

        var n = (await admin.CreateClinicAsync(Unique.Name("N", "ن"), "+20 " + s.Phone[3..6] + " " + s.Phone[6..9] + " " + s.Phone[9..], "Sara")).Details;

        (await App.UserCountAsync()).ShouldBe(users);
        var owner = (await admin.StaffAsync(n.Id)).ShouldHaveSingleItem();
        owner.UserId.ShouldBe(s.UserId);
        owner.FullName.ShouldBe("Sara");
        owner.Roles.Select(r => r.Name).ShouldBe(["Owner"]);
        (await admin.StaffAsync(a.Id)).Single(x => x.Id == s.Id).FullName.ShouldBe("Dev Assistant");
    }

    [Fact]
    [Trait("Case", "ADM-079")]
    public async Task A_staff_member_made_owner_while_logged_in_sees_the_new_clinic_at_the_next_refresh_and_enters_it_as_Owner()
    {
        var admin = await Login.SharedSuperAdminAsync();
        var a = await Data.Clinic();
        var s = await Data.Staff(a).WithRole("Assistant");
        var browser = await Login.StaffAsync(s);

        var n = await admin.CreateClinicAsync(s.Phone, "Sara");

        var contexts = await (await browser.GetAsync("/api/v1/auth/contexts")).ReadAsync<List<ContextDto>>();
        contexts.ShouldContain(c => c.ClinicId == n.Id);
        await (await browser.RefreshAsync()).ShouldBeOkAsync();
        browser.Auth.Contexts.ShouldContain(c => c.ClinicId == n.Id);
        var entered = await browser.EnterClinicAsync(n.Id);
        entered.Context.Roles.ShouldBe(["Owner"]);
        (await browser.MeAsync()).Permissions.ShouldBe(PermissionKeys.CatalogOrder, ignoreOrder: true);
    }

    [Fact]
    [Trait("Case", "ADM-080")]
    public async Task The_super_admins_own_phone_as_owner_keeps_the_platform_context()
    {
        var admin = await Login.SharedSuperAdminAsync();

        var clinic = await admin.CreateClinicAsync(Login.SuperAdminPhone, "Super Owner");

        clinic.Owners.ShouldHaveSingleItem().Phone.ShouldBe(Login.SuperAdminPhone);
        var again = await Login.AsAsync(Login.SuperAdminPhone);
        again.Auth.Contexts.ShouldContain(c => c.Type == "platform");
        again.Auth.Contexts.ShouldContain(c => c.ClinicId == clinic.Id && c.Roles.Contains("Owner"));
        await again.EnterPlatformAsync();
        await (await again.GetAsync(AdminRoutes.Clinics)).ShouldBeOkAsync();
        (await again.MeAsync()).User.IsSuperAdmin.ShouldBeTrue();
    }

    [Fact]
    [Trait("Case", "ADM-081")]
    public async Task The_owner_phone_of_a_deleted_clinic_reuses_that_user()
    {
        var admin = await Login.SharedSuperAdminAsync();
        var deleted = await Data.Clinic().Deleted();
        var users = await App.UserCountAsync();

        var clinic = await admin.CreateClinicAsync(deleted.Owner.Phone);

        (await App.UserCountAsync()).ShouldBe(users);
        (await admin.StaffAsync(clinic.Id)).Single().UserId.ShouldBe(deleted.Owner.UserId);
    }

    [Fact]
    [Trait("Case", "ADM-082")]
    public async Task Clinic_names_need_not_be_unique_and_the_owners_tell_them_apart()
    {
        var admin = await Login.SharedSuperAdminAsync();
        var name = $"Same {Unique.Next()}";
        var first = (await admin.CreateClinicAsync(name, Unique.Phone(), "First Owner")).Details;

        var second = (await admin.CreateClinicAsync(name, Unique.Phone(), "Second Owner")).Details;

        second.Id.ShouldNotBe(first.Id);
        second.Name.ShouldBe(first.Name);
        (await admin.ClinicAsync(first.Id)).Owners.Single().FullName.ShouldBe("First Owner");
        (await admin.ClinicAsync(second.Id)).Owners.Single().FullName.ShouldBe("Second Owner");
    }

    [Fact]
    [Trait("Case", "ADM-083")]
    public async Task A_created_clinic_is_listed_at_once_and_its_details_equal_the_201_body()
    {
        var admin = await Login.SharedSuperAdminAsync();
        var name = $"Listed {Unique.Next()}";

        var created = (await admin.CreateClinicAsync(name, Unique.Phone(), "Owner")).Details;

        var listed = (await admin.ListClinicsAsync($"search={Uri.EscapeDataString(name)}")).Items.ShouldHaveSingleItem();
        listed.Id.ShouldBe(created.Id);
        listed.StaffCount.ShouldBe(1);
        listed.Status.ShouldBe("active");
        (await admin.ClinicAsync(created.Id)).ShouldBeEquivalentTo(created);
    }

    [Fact]
    [Trait("Case", "ADM-084")]
    public async Task The_creation_date_is_the_clocks_time()
    {
        var admin = await Login.SharedSuperAdminAsync();
        Clock.Advance(TimeSpan.FromMinutes(3) + TimeSpan.FromSeconds(7));

        var created = await admin.CreateClinicAsync();

        created.CreatedAt.ShouldBe(Clock.GetUtcNow().UtcDateTime);
        (await admin.ListClinicsAsync($"search={Uri.EscapeDataString(created.Name)}")).Items.Single().CreatedAt
            .ShouldBe(Clock.GetUtcNow().UtcDateTime);
    }
}

/// <summary>
/// Template edits around a create (the snapshot rule): these tests change the template, so they get their own class
/// (fresh template per class) and can't disturb the exact template checks of <see cref="CreateClinicProvisioningTests"/>.
/// </summary>
[Collection(AdminCollection3.Name)]
[Trait("Area", "admin")]
public class TemplateSnapshotTests(AppFixture app) : IntegrationTest(app)
{
    private static string Json(object value) => JsonSerializer.Serialize(value, Harness.Assertions.Json.Options);

    private static string DrugContent(DrugDto drug) => Json(new { drug.Name, drug.Description, drug.DefaultDosing });

    private Task<TemplateCatalog> TemplateAsync() => TemplateCatalog.CreateAsync(App);

    private Task<ApiClient> InTemplateAsync() => Login.SuperAdminInTemplateAsync();

    [Fact]
    [Trait("Case", "ADM-073")]
    public async Task Renaming_a_template_drug_later_does_not_change_the_clinics_copy()
    {
        var template = await TemplateAsync();
        var admin = await Login.SharedSuperAdminAsync();
        var inTemplate = await InTemplateAsync();
        var phone = Unique.Phone();
        await admin.CreateClinicAsync(phone);
        var owner = await Login.AsAsync(phone);
        var copyBefore = (await owner.DrugsAsync()).Items.Select(d => Json(d)).ToList();

        await (await inTemplate.PutAsync($"/api/v1/drugs/{template.First.Id}", new
        {
            name = template.First.Name + " EDITED", description = template.First.Description, defaultDosing = template.First.DefaultDosing,
        })).ShouldBeOkAsync();

        (await owner.DrugsAsync()).Items.Select(d => Json(d)).ShouldBe(copyBefore);
    }

    [Fact]
    [Trait("Case", "ADM-075")]
    public async Task A_clinic_created_after_a_template_edit_gets_the_template_as_it_is_then()
    {
        var template = await TemplateAsync();
        var admin = await Login.SharedSuperAdminAsync();
        var earlierPhone = Unique.Phone();
        await admin.CreateClinicAsync(earlierPhone);
        var added = await Data.Drug(template.TemplateId).Named(Unique.Name("Added later", "أضيف لاحقًا")).WithDosing(Dosings.Tablets());
        var laterPhone = Unique.Phone();
        await admin.CreateClinicAsync(laterPhone);

        var later = (await (await Login.AsAsync(laterPhone)).DrugsAsync()).Items;
        var earlier = (await (await Login.AsAsync(earlierPhone)).DrugsAsync()).Items;

        later.Select(DrugContent).ShouldContain(DrugContent(added));
        earlier.Select(d => d.Name).ShouldNotContain(added.Name);
    }
}

/// <summary>An empty template (the class starts on a fresh template: no drugs, no groups).</summary>
[Collection(AdminCollection3.Name)]
[Trait("Area", "admin")]
public class CreateClinicFromAnEmptyTemplateTests(AppFixture app) : IntegrationTest(app)
{
    [Fact]
    [Trait("Case", "ADM-076")]
    public async Task An_empty_template_gives_a_clinic_with_roles_and_owner_and_no_drugs_or_groups()
    {
        var admin = await Login.SuperAdminAsync();
        var templateId = await App.TemplateClinicIdAsync();
        (await App.QueryDbAsync(db => db.Drugs.IgnoreQueryFilters().CountAsync(d => d.ClinicId == templateId))).ShouldBe(0);
        var phone = Unique.Phone();

        var clinic = await admin.CreateClinicAsync(phone);

        clinic.Owners.ShouldHaveSingleItem();
        (await admin.RolesAsync(clinic.Id)).Select(r => r.Name).ShouldBe(["Owner", "Assistant", "Doctor"]);
        var owner = await Login.AsAsync(phone);
        (await owner.DrugsAsync()).TotalCount.ShouldBe(0);
        (await owner.GroupsAsync()).ShouldBeEmpty();
    }
}

/// <summary>
/// All or nothing (business "القواعد التشغيلية": a failing part creates neither the clinic nor the owner's account):
/// the restarted API has one more seeder that throws after the given one.
/// </summary>
[Collection(AdminCollection3.Name)]
[Trait("Area", "admin")]
public class CreateClinicRollbackTests(AppFixture app) : IntegrationTest(app)
{
    [Theory]
    [Trait("Case", "ADM-077")]
    [InlineData(15)] // after the roles
    [InlineData(25)] // after the owner
    [InlineData(35)] // after the catalog copy
    public async Task A_failing_seeder_answers_500_and_leaves_nothing(int failAt)
    {
        await TemplateCatalog.CreateAsync(App);
        var phone = Unique.Phone();
        var before = await App.RowCountsAsync();
        await using var variant = App.CreateVariant(services: s => s.AddScoped<IClinicSeeder>(_ => new FailingSeeder(failAt)));
        variant.Start();
        var admin = await Login.On(variant).SuperAdminAsync();

        var response = await admin.PostAsync(AdminRoutes.Clinics, new { name = $"Rollback {failAt}", owner = new { phone, fullName = "Rollback Owner" } });

        await response.ShouldBeProblemAsync(HttpStatusCode.InternalServerError, "unexpected");
        (await App.RowCountsAsync()).ShouldBe(before);
        (await App.QueryDbAsync(db => db.Users.CountAsync(u => u.Phone == phone))).ShouldBe(0);
        (await App.QueryDbAsync(db => db.Clinics.CountAsync(c => c.Name == $"Rollback {failAt}"))).ShouldBe(0);
    }

    [Fact]
    public async Task The_same_create_without_the_failure_succeeds()
    {
        // Ported from accept-api.py "create clinic: rollback" (sending it again works)
        await TemplateCatalog.CreateAsync(App);
        var phone = Unique.Phone();
        await using (var variant = App.CreateVariant(services: s => s.AddScoped<IClinicSeeder>(_ => new FailingSeeder(35))))
        {
            variant.Start();
            var failing = await Login.On(variant).SuperAdminAsync();
            (await failing.PostAsync(AdminRoutes.Clinics, new { name = "Rollback again", owner = new { phone, fullName = "O" } }))
                .StatusCode.ShouldBe(HttpStatusCode.InternalServerError);
        }

        var admin = await Login.SuperAdminAsync();
        var created = (await admin.CreateClinicAsync("Rollback again", phone, "O")).Details;

        created.Owners.Single().Phone.ShouldBe(phone);
    }

    private sealed class FailingSeeder(int order) : IClinicSeeder
    {
        public int Order => order;

        public Task SeedAsync(ClinicSeedContext context, CancellationToken cancellationToken) =>
            throw new InvalidOperationException($"Seeder failure injected by the test after order {order - 5}");
    }
}
