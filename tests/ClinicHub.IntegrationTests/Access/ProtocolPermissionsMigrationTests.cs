using System.Net;
using ClinicHub.Application.Features.Access;
using ClinicHub.Application.Features.Identity.Users.Queries.GetMe;
using ClinicHub.IntegrationTests.Catalog;
using ClinicHub.IntegrationTests.Catalog.Migrations;
using ClinicHub.IntegrationTests.Harness.Assertions;
using ClinicHub.IntegrationTests.Harness.Builders;
using ClinicHub.IntegrationTests.Harness.Clients;
using ClinicHub.IntegrationTests.Harness.Hosting;
using Shouldly;
using static ClinicHub.IntegrationTests.Catalog.Migrations.RenameMigrationKit;

namespace ClinicHub.IntegrationTests.Access;

/// <summary>
/// The stored permission keys moved by <c>RenameGroupsToProtocols</c> (design D10): <c>groups.*</c> →
/// <c>protocols.*</c> in every clinic's roles, nothing else touched, and the staff keep their rights across the deploy.
/// On the migration collection (it migrates its database down and up again).
/// </summary>
[Collection(CatalogMigrationCollection.Name)]
[Trait("Area", "access")]
public class ProtocolPermissionsMigrationTests(BareAppFixture app) : IntegrationTest(app)
{
    [Fact]
    [Trait("Case", "ACC-085")]
    public async Task A_role_holding_groups_update_holds_protocols_update_after_it_and_its_staff_keep_their_rights_without_a_new_login()
    {
        // The bare template has no imported category (design M1.7 D12)
        var category = await MigrationData.TestCategoryAsync(App);
        var clinic = await Data.Clinic();
        var protocol = await Data.Protocol(clinic).With(await Data.Drug(clinic).InCategory(category));
        var role = await Data.Role(clinic).WithPermissions(Permissions.Protocols.Update);
        var staff = await Data.Staff(clinic).WithRoles(role.Id);
        // Logged in before the deploy: the same access token is sent after it
        var before = await Login.StaffAsync(staff);
        try
        {
            // The deploy migrates up through AddSharedCatalog, which needs an empty Drugs table (design M1.7 § 5): the
            // protocol keeps no line, and the drug for the protocol bodies is created after the deploy
            await MigrationData.DeleteDrugsAsync(App);
            await MigrateAsync(App, Before);
            // As the role editor stored it before M1.7a: the key and its requirements
            await SetRoleKeysAsync(App, role.Id, "drugs.list", "groups.details", "groups.list", "groups.update");

            // The deploy: a new app starts (its startup migrates), with nothing cached
            await using var deployed = App.CreateVariant();
            deployed.Start();
            var next = new ApiClient(deployed) { AccessToken = before.AccessToken };
            var drug = await Data.Drug(clinic).InCategory(await MigrationData.TestCategoryAsync(App));

            (await RoleKeysAsync(App, role.Id)).ShouldBe(["drugs.list", "protocols.details", "protocols.list", "protocols.update"]);
            var me = await next.GetAsync("/api/v1/me");
            await me.ShouldBeOkAsync();
            (await me.ReadAsync<MeDto>()).Permissions.ShouldBe(["drugs.list", "protocols.list", "protocols.details", "protocols.update"]);
            await (await next.GetAsync("/api/v1/protocols")).ShouldBeOkAsync();
            await (await next.GetAsync($"/api/v1/protocols/{protocol.Id}")).ShouldBeOkAsync();
            await (await next.PutAsync($"/api/v1/protocols/{protocol.Id}", CatalogRoutes.ProtocolBody(drug.Id)))
                .ShouldBeOkAsync();
            // Only the same rights: nothing gained
            await (await next.PostAsync("/api/v1/protocols", CatalogRoutes.ProtocolBody(drug.Id)))
                .ShouldBeProblemAsync(HttpStatusCode.Forbidden, "forbidden");
            await (await next.DeleteAsync($"/api/v1/protocols/{protocol.Id}")).ShouldBeProblemAsync(HttpStatusCode.Forbidden, "forbidden");
        }
        finally
        {
            await MigrationData.MigrateToLatestAsync(App);
        }
    }

    [Fact]
    [Trait("Case", "ACC-088")]
    public async Task Only_keys_starting_with_groups_move_in_every_clinic_the_deleted_ones_and_the_template_included()
    {
        var clinic = await Data.Clinic();
        var custom = await Data.Role(clinic);
        var deleted = await Data.Clinic();
        var deletedRole = await Data.Role(deleted);
        await Data.DeleteClinicAsync(deleted);
        var templateId = await App.TemplateClinicIdAsync();
        try
        {
            await MigrateAsync(App, Before);
            var templateRole = await InsertRoleAsync(App, templateId, Unique.Name("Template role", "دور النموذج"));
            // Look-alikes that don't start with "groups." stay as they are
            await SetRoleKeysAsync(App, custom.Id,
                "groups.list", "groups.delete", "drugs.list", "xgroups.list", "groupsx.list", "groups", "drugs.groups.list", "Groups.list");
            await SetRoleKeysAsync(App, deletedRole.Id, "groups.list", "groups.details");
            await SetRoleKeysAsync(App, templateRole, "drugs.list", "groups.list", "groups.create");
            var rowsBefore = await PermissionRowsAsync(App);

            await MigrateAsync(App, Rename);

            (await RoleKeysAsync(App, custom.Id)).ShouldBe(new[]
            {
                "protocols.list", "protocols.delete", "drugs.list", "xgroups.list", "groupsx.list", "groups", "drugs.groups.list", "Groups.list",
            }.Order(StringComparer.Ordinal).ToList());
            (await RoleKeysAsync(App, deletedRole.Id)).ShouldBe(["protocols.details", "protocols.list"]);
            (await RoleKeysAsync(App, templateRole)).ShouldBe(["drugs.list", "protocols.create", "protocols.list"]);
            var rowsAfter = await PermissionRowsAsync(App);
            rowsAfter.Count.ShouldBe(rowsBefore.Count, "one row per row before: none lost, none added");
            rowsAfter.Distinct().Count().ShouldBe(rowsAfter.Count, "no role holds a key twice");
            rowsAfter.ShouldBe(Renamed(rowsBefore, "groups.", "protocols."), "every clinic's roles");
            rowsAfter.Where(r => r[(r.IndexOf(':') + 1)..].StartsWith("groups.", StringComparison.Ordinal)).ShouldBeEmpty("groups.* rows left");
        }
        finally
        {
            await MigrationData.MigrateToLatestAsync(App);
        }
    }
}
