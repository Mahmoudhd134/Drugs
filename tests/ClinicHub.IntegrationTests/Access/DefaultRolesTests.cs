using System.Net;
using ClinicHub.Application.Features.Access;
using ClinicHub.Application.Features.Catalog.Drugs;
using ClinicHub.IntegrationTests.Harness.Assertions;
using ClinicHub.IntegrationTests.Harness.Hosting;
using Microsoft.EntityFrameworkCore;
using Npgsql;
using Shouldly;

namespace ClinicHub.IntegrationTests.Access;

/// <summary>Who can do what: the default roles, custom roles, several roles, the super admin (access business + tech).</summary>
[Collection(AccessCollection2.Name)]
[Trait("Area", "access")]
public class DefaultRolesTests(AppFixture app) : IntegrationTest(app)
{
    private static readonly string[] AllKeys =
    [
        "drugs.list", "drugs.details", "drugs.create", "drugs.update", "drugs.delete",
        "groups.list", "groups.details", "groups.create", "groups.update", "groups.delete",
        "prescriptions.create",
    ];

    /// <summary>The Assistant: everything but the deletes (access business § default roles).</summary>
    private static readonly string[] AssistantKeys = AllKeys.Where(k => k is not ("drugs.delete" or "groups.delete")).ToArray();

    // Every endpoint, deletes last (they remove the target)
    private static readonly string[] EveryEndpointInOrder =
    [
        "GET /drugs", "GET /drugs/{id}", "GET /drugs/{id}/groups", "POST /drugs", "PUT /drugs/{id}",
        "GET /drug-groups", "GET /drug-groups/{id}", "POST /drug-groups", "PUT /drug-groups/{id}",
        "DELETE /drug-groups/{id}", "DELETE /drugs/{id}",
    ];

    [Fact]
    [Trait("Tier", "Smoke")]
    [Trait("Case", "ACC-010")]
    public async Task The_owner_has_every_permission_and_every_catalog_call_succeeds()
    {
        var clinic = await Data.Clinic();
        var target = await CatalogRoutes.TargetAsync(Data, clinic);
        var owner = await Login.OwnerAsync(clinic);

        var me = await owner.MeAsync();

        me.Permissions.ShouldBe(AllKeys);
        me.Context.Roles.ShouldBe(["Owner"]);
        foreach (var endpoint in EveryEndpointInOrder)
            await (await CatalogRoutes.CallAsync(owner, endpoint, target)).ShouldSucceedAsync();
    }

    [Fact]
    [Trait("Case", "ACC-011")]
    public async Task A_doctor_deletes_a_drug_and_a_group_and_has_every_key()
    {
        var clinic = await Data.Clinic();
        var target = await CatalogRoutes.TargetAsync(Data, clinic);
        var doctor = await Login.WithRoleAsync(clinic, "Doctor");

        (await doctor.MeAsync()).Permissions.ShouldBe(AllKeys);
        await (await doctor.DeleteAsync($"/api/v1/drugs/{target.DrugId}")).ShouldBeAsync(HttpStatusCode.NoContent);
        await (await doctor.DeleteAsync($"/api/v1/drug-groups/{target.GroupId}")).ShouldBeAsync(HttpStatusCode.NoContent);

        await (await doctor.GetAsync($"/api/v1/drugs/{target.DrugId}")).ShouldBeProblemAsync(HttpStatusCode.NotFound, "notFound");
        await (await doctor.GetAsync($"/api/v1/drug-groups/{target.GroupId}")).ShouldBeProblemAsync(HttpStatusCode.NotFound, "notFound");
    }

    [Fact]
    [Trait("Tier", "Smoke")]
    [Trait("Case", "ACC-012")]
    public async Task An_assistant_cannot_delete_but_creates_and_updates()
    {
        var clinic = await Data.Clinic();
        var target = await CatalogRoutes.TargetAsync(Data, clinic);
        var assistant = await Login.WithRoleAsync(clinic, "Assistant");

        await (await assistant.DeleteAsync($"/api/v1/drugs/{target.DrugId}")).ShouldBeProblemAsync(HttpStatusCode.Forbidden, "forbidden");
        await (await assistant.DeleteAsync($"/api/v1/drug-groups/{target.GroupId}")).ShouldBeProblemAsync(HttpStatusCode.Forbidden, "forbidden");

        await (await assistant.GetAsync($"/api/v1/drugs/{target.DrugId}")).ShouldBeOkAsync();
        await (await assistant.GetAsync($"/api/v1/drug-groups/{target.GroupId}")).ShouldBeOkAsync();
        await (await assistant.PostAsync("/api/v1/drugs", new { name = "Vigamox " + Guid.NewGuid() })).ShouldBeAsync(HttpStatusCode.Created);
        await (await assistant.PutAsync($"/api/v1/drugs/{target.DrugId}", new { name = "Tobradex " + Guid.NewGuid() })).ShouldBeOkAsync();
        await (await assistant.PostAsync("/api/v1/drug-groups", CatalogRoutes.GroupBody(target.GroupDrugId))).ShouldBeAsync(HttpStatusCode.Created);
        await (await assistant.PutAsync($"/api/v1/drug-groups/{target.GroupId}", CatalogRoutes.GroupBody(target.GroupDrugId))).ShouldBeOkAsync();
        (await assistant.MeAsync()).Permissions.ShouldBe(AssistantKeys);
    }

    [Fact]
    [Trait("Case", "ACC-013")]
    public async Task A_read_only_role_reads_but_every_write_is_forbidden()
    {
        var clinic = await Data.Clinic();
        var target = await CatalogRoutes.TargetAsync(Data, clinic);
        var viewer = await Login.WithPermissionsAsync(clinic,
            Permissions.Drugs.List, Permissions.Drugs.Details, Permissions.Groups.List, Permissions.Groups.Details);

        foreach (var endpoint in new[] { "GET /drugs", "GET /drugs/{id}", "GET /drugs/{id}/groups", "GET /drug-groups", "GET /drug-groups/{id}" })
            await (await CatalogRoutes.CallAsync(viewer, endpoint, target)).ShouldBeOkAsync();
        foreach (var endpoint in new[] { "POST /drugs", "PUT /drugs/{id}", "DELETE /drugs/{id}", "POST /drug-groups", "PUT /drug-groups/{id}", "DELETE /drug-groups/{id}" })
            await (await CatalogRoutes.CallAsync(viewer, endpoint, target)).ShouldBeProblemAsync(HttpStatusCode.Forbidden, "forbidden");

        (await viewer.MeAsync()).Permissions.ShouldBe(["drugs.list", "drugs.details", "groups.list", "groups.details"]);
        await (await viewer.GetAsync($"/api/v1/drugs/{target.DrugId}")).ShouldBeOkAsync();
        await (await viewer.GetAsync($"/api/v1/drug-groups/{target.GroupId}")).ShouldBeOkAsync();
    }

    [Fact]
    [Trait("Case", "ACC-014")]
    public async Task The_super_admin_in_the_template_has_every_key_and_no_staff()
    {
        var admin = await Login.SuperAdminInTemplateAsync();

        var me = await admin.MeAsync();
        me.Permissions.ShouldBe(AllKeys);
        me.Staff.ShouldBeNull();

        var created = await (await admin.PostAsync("/api/v1/drugs", new { name = "Pred Forte " + Guid.NewGuid() }))
            .ReadAsync<DrugDto>();
        await (await admin.DeleteAsync($"/api/v1/drugs/{created.Id}")).ShouldBeAsync(HttpStatusCode.NoContent);
    }

    [Fact]
    [Trait("Case", "ACC-015")]
    public async Task A_super_admin_who_is_an_assistant_of_a_clinic_has_only_the_assistant_keys_there()
    {
        var clinic = await Data.Clinic();
        var target = await CatalogRoutes.TargetAsync(Data, clinic);
        var staff = await Data.Staff(clinic).WithPhone(Login.SuperAdminPhone).WithRole("Assistant");
        var admin = await Login.StaffAsync(staff);

        (await admin.MeAsync()).Permissions.ShouldBe(AssistantKeys);
        await (await admin.DeleteAsync($"/api/v1/drugs/{target.DrugId}")).ShouldBeProblemAsync(HttpStatusCode.Forbidden, "forbidden");
    }

    [Fact]
    [Trait("Case", "ACC-016")]
    public async Task Two_roles_give_the_union_of_their_permissions()
    {
        var clinic = await Data.Clinic();
        var target = await CatalogRoutes.TargetAsync(Data, clinic);
        var creator = await Data.Role(clinic).WithPermissions(Permissions.Drugs.Create);
        var groupRemover = await Data.Role(clinic).WithPermissions(Permissions.Groups.Delete);
        var user = await Login.StaffAsync(await Data.Staff(clinic).WithRoles(creator.Id, groupRemover.Id));

        (await user.MeAsync()).Permissions.ShouldBe(["drugs.list", "drugs.create", "groups.list", "groups.delete"]);
        await (await user.PostAsync("/api/v1/drugs", new { name = "Vigamox " + Guid.NewGuid() })).ShouldBeAsync(HttpStatusCode.Created);
        await (await user.DeleteAsync($"/api/v1/drug-groups/{target.GroupId}")).ShouldBeAsync(HttpStatusCode.NoContent);
        await (await user.DeleteAsync($"/api/v1/drugs/{target.DrugId}")).ShouldBeProblemAsync(HttpStatusCode.Forbidden, "forbidden");
    }

    [Fact]
    [Trait("Case", "ACC-017")]
    public async Task The_owner_role_with_another_role_still_has_every_permission()
    {
        var clinic = await Data.Clinic();
        var target = await CatalogRoutes.TargetAsync(Data, clinic);
        var listOnly = await Data.Role(clinic).WithPermissions(Permissions.Drugs.List);
        var user = await Login.StaffAsync(await Data.Staff(clinic).WithRoles(listOnly.Id, clinic.RoleId("Owner")));

        (await user.MeAsync()).Permissions.ShouldBe(AllKeys);
        await (await user.DeleteAsync($"/api/v1/drugs/{target.DrugId}")).ShouldBeAsync(HttpStatusCode.NoContent);
    }

    [Fact]
    [Trait("Case", "ACC-018")]
    public async Task A_role_stored_with_only_drugs_update_still_opens_a_drug()
    {
        var clinic = await Data.Clinic();
        var drug = await Data.Drug(clinic);
        var role = await Data.Role(clinic).WithPermissions(Permissions.Drugs.Update);
        await SetRolePermissionsByHandAsync(role.Id, Permissions.Drugs.Update);
        var user = await Login.StaffAsync(await Data.Staff(clinic).WithRoles(role.Id));

        await (await user.GetAsync($"/api/v1/drugs/{drug.Id}")).ShouldBeOkAsync();
        await (await user.GetAsync("/api/v1/drugs")).ShouldBeOkAsync();
        (await user.MeAsync()).Permissions.ShouldBe(["drugs.list", "drugs.details", "drugs.update"]);
    }

    [Fact]
    [Trait("Case", "ACC-019")]
    public async Task A_stored_key_that_is_not_in_the_catalog_is_ignored()
    {
        var clinic = await Data.Clinic();
        var role = await Data.Role(clinic).WithPermissions(Permissions.Drugs.List);
        await SetRolePermissionsByHandAsync(role.Id, Permissions.Drugs.List, "drugs.archive");
        var user = await Login.StaffAsync(await Data.Staff(clinic).WithRoles(role.Id));

        await (await user.GetAsync("/api/v1/drugs")).ShouldBeOkAsync();
        (await user.MeAsync()).Permissions.ShouldBe(["drugs.list"]);
        await (await user.PostAsync("/api/v1/drugs", new { name = "Vigamox " + Guid.NewGuid() }))
            .ShouldBeProblemAsync(HttpStatusCode.Forbidden, "forbidden");
    }

    [Fact]
    [Trait("Case", "ACC-020")]
    public async Task A_staff_member_without_a_role_is_forbidden_everywhere()
    {
        var clinic = await Data.Clinic();
        var target = await CatalogRoutes.TargetAsync(Data, clinic);
        var staff = await Data.Staff(clinic).WithRole("Doctor");
        await App.OutsideTheApp.ExecuteAsync("""DELETE FROM "StaffRoles" WHERE "StaffId" = @p0""", staff.Id);
        var user = await Login.StaffAsync(staff);

        foreach (var endpoint in EveryEndpointInOrder)
            await (await CatalogRoutes.CallAsync(user, endpoint, target)).ShouldBeProblemAsync(HttpStatusCode.Forbidden, "forbidden");
        (await user.MeAsync()).Permissions.ShouldBeEmpty();
    }

    [Fact]
    [Trait("Case", "ACC-021")]
    public async Task A_second_owner_role_in_a_clinic_is_rejected_by_the_database()
    {
        var clinic = await Data.Clinic();

        var error = await Should.ThrowAsync<PostgresException>(() => App.OutsideTheApp.ExecuteAsync(
            """
            INSERT INTO "Roles" ("ClinicId", "Name", "IsOwner", "CreatedAt", "UpdatedAt")
            VALUES (@p0, @p1, true, now(), now())
            """, clinic.Id, "Second owner " + Guid.NewGuid()));

        error.SqlState.ShouldBe(PostgresErrorCodes.UniqueViolation);
        error.ConstraintName.ShouldBe("IX_Roles_ClinicId_Owner");
        (await App.QueryDbAsync(db => db.Roles.IgnoreQueryFilters().CountAsync(r => r.ClinicId == clinic.Id && r.IsOwner))).ShouldBe(1);
    }

    /// <summary>A role's stored keys replaced by hand (psql), before anyone holding it logs in (nothing cached yet).</summary>
    private async Task SetRolePermissionsByHandAsync(int roleId, params string[] keys)
    {
        await App.OutsideTheApp.ExecuteAsync("""DELETE FROM "RolePermissions" WHERE "RoleId" = @p0""", roleId);
        foreach (var key in keys)
            await App.OutsideTheApp.ExecuteAsync("""INSERT INTO "RolePermissions" ("RoleId", "Permission") VALUES (@p0, @p1)""", roleId, key);
    }
}
