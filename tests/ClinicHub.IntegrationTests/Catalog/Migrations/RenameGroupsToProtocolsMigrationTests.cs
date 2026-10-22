using ClinicHub.Application.Features.Access;
using ClinicHub.IntegrationTests.Harness.Builders;
using ClinicHub.IntegrationTests.Harness.Hosting;
using Shouldly;
using static ClinicHub.IntegrationTests.Catalog.Migrations.RenameMigrationKit;

namespace ClinicHub.IntegrationTests.Catalog.Migrations;

/// <summary>
/// <c>RenameGroupsToProtocols</c> (design D10, § 5; M1.7a contract "Migration"): applied on a database with own drugs,
/// protocols and roles holding <c>groups.*</c>, it keeps every row and right under the new names; down and up again
/// round-trips. Runs on the migration collection's own database, which it leaves migrated to the latest version.
/// </summary>
[Collection(CatalogMigrationCollection.Name)]
[Trait("Area", "catalog")]
public class RenameGroupsToProtocolsMigrationTests(AppFixture app) : IntegrationTest(app)
{
    [Fact]
    [Trait("Case", "CAT-003")]
    public async Task Applied_it_keeps_every_protocol_line_order_and_override_renames_the_constraints_and_moves_the_rights()
    {
        var data = await CatalogDataAsync();
        try
        {
            // The database before the migration, with its rows; the custom role holds groups.* as a role saved before M1.7a
            await MigrateAsync(App, Before);
            (await ExistingTablesAsync(App, "Protocols", "ProtocolItems")).ShouldBe(["DrugGroupItems", "DrugGroups"], "tables before");
            await SetRoleKeysAsync(App, data.EditorRoleId, "drugs.list", "groups.details", "groups.list", "groups.update");
            var rowsBefore = await ProtocolRowsAsync(App, Old);
            rowsBefore.Count(r => r.StartsWith("P|")).ShouldBeGreaterThanOrEqualTo(2, "protocols before");
            rowsBefore.Count(r => r.StartsWith("I|")).ShouldBeGreaterThanOrEqualTo(4, "lines before");
            var rightsBefore = await PermissionRowsAsync(App);
            rightsBefore.ShouldContain($"{data.EditorRoleId}:groups.update");

            await MigrateAsync(App, Rename);

            (await ExistingTablesAsync(App, "Protocols", "ProtocolItems")).ShouldBe(["ProtocolItems", "Protocols"], "tables after");
            (await HasColumnAsync(App, "ProtocolItems", "ProtocolId")).ShouldBeTrue("ProtocolItems.ProtocolId");
            (await ProtocolRowsAsync(App, New)).ShouldBe(rowsBefore, "every protocol and line, column by column");
            (await ConstraintsAsync(App, NewConstraints)).ShouldBe(NewConstraints.Order(StringComparer.Ordinal).ToList(), "constraints");
            (await IndexesAsync(App, NewIndexes)).ShouldBe(NewIndexes.Order(StringComparer.Ordinal).ToList(), "indexes");
            (await SequencesAsync(App, NewSequences)).ShouldBe(NewSequences.Order(StringComparer.Ordinal).ToList(), "identity sequences");
            (await DrugGroupLeftoversAsync(App)).ShouldBeEmpty("names still holding DrugGroup");
            (await PermissionRowsAsync(App)).ShouldBe(Renamed(rightsBefore, "groups.", "protocols."), "every role's rights");
            (await RoleKeysAsync(App, data.EditorRoleId))
                .ShouldBe(["drugs.list", "protocols.details", "protocols.list", "protocols.update"]);
        }
        finally
        {
            await MigrateAsync(App, null);
        }
    }

    [Fact]
    [Trait("Case", "CAT-004")]
    public async Task Down_and_up_again_round_trips_the_data_and_the_permission_keys()
    {
        var data = await CatalogDataAsync();
        var rows = await ProtocolRowsAsync(App, New);
        var rights = await PermissionRowsAsync(App);
        rights.ShouldContain($"{data.EditorRoleId}:protocols.update");
        try
        {
            await MigrateAsync(App, Before);

            (await ExistingTablesAsync(App, "Protocols", "ProtocolItems")).ShouldBe(["DrugGroupItems", "DrugGroups"], "tables after down");
            (await HasColumnAsync(App, "DrugGroupItems", "DrugGroupId")).ShouldBeTrue("DrugGroupItems.DrugGroupId after down");
            (await ProtocolRowsAsync(App, Old)).ShouldBe(rows, "rows after down");
            (await ConstraintsAsync(App, OldConstraints)).ShouldBe(OldConstraints.Order(StringComparer.Ordinal).ToList(), "constraints after down");
            (await IndexesAsync(App, OldIndexes)).ShouldBe(OldIndexes.Order(StringComparer.Ordinal).ToList(), "indexes after down");
            (await SequencesAsync(App, OldSequences)).ShouldBe(OldSequences.Order(StringComparer.Ordinal).ToList(), "sequences after down");
            (await PermissionRowsAsync(App)).ShouldBe(Renamed(rights, "protocols.", "groups."), "keys after down");

            await MigrateAsync(App, Rename);

            (await ProtocolRowsAsync(App, New)).ShouldBe(rows, "rows after up again");
            (await ConstraintsAsync(App, NewConstraints)).ShouldBe(NewConstraints.Order(StringComparer.Ordinal).ToList(), "constraints after up again");
            (await IndexesAsync(App, NewIndexes)).ShouldBe(NewIndexes.Order(StringComparer.Ordinal).ToList(), "indexes after up again");
            (await SequencesAsync(App, NewSequences)).ShouldBe(NewSequences.Order(StringComparer.Ordinal).ToList(), "sequences after up again");
            (await PermissionRowsAsync(App)).ShouldBe(rights, "keys after up again");
        }
        finally
        {
            await MigrateAsync(App, null);
        }
    }

    private sealed record CatalogData(int EditorRoleId);

    /// <summary>
    /// A clinic with own drugs and two protocols (lines in a non-id order, overrides of every kind: a full dosing, a
    /// taper, the asked eye, none), a protocol of a deleted clinic and one of the template, and a custom role.
    /// </summary>
    private async Task<CatalogData> CatalogDataAsync()
    {
        var clinic = await Data.Clinic();
        var first = await Data.Drug(clinic).WithDosing(Dosings.Drops());
        var second = await Data.Drug(clinic).WithDosing(Dosings.Tablets());
        var third = await Data.Drug(clinic);
        await Data.Protocol(clinic).Named(Unique.Name("Post cataract", "بعد المياه البيضاء"))
            .With(third, Dosings.Taper()).With(first).With(second, Dosings.Drops(2, 6, 2, "right"));
        await Data.Protocol(clinic).With(first, Dosings.AskEye()).With(second, Dosings.Drops(eye: "left"));

        var deleted = await Data.Clinic();
        await Data.Protocol(deleted).With(await Data.Drug(deleted), Dosings.Tablets(2));
        await Data.DeleteClinicAsync(deleted);

        var templateId = await App.TemplateClinicIdAsync();
        await Data.Protocol(templateId).With(await Data.Drug(templateId), Dosings.AskEye());

        var editor = await Data.Role(clinic).WithPermissions(Permissions.Protocols.Update);
        return new CatalogData(editor.Id);
    }
}
