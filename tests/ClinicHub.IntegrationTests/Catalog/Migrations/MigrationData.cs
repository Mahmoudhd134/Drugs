using ClinicHub.IntegrationTests.Harness.Builders;
using ClinicHub.IntegrationTests.Harness.Hosting;

namespace ClinicHub.IntegrationTests.Catalog.Migrations;

/// <summary>
/// Data rules of the migration collection (design M1.7 D12, § 5): its database is a copy of the bare template (no
/// imported catalog), so the builders' default category «العيون › المياه الزرقاء» doesn't exist there: drugs go in a
/// test category (<see cref="TestCategoryAsync"/>). <c>AddSharedCatalog</c> needs an empty <c>Drugs</c> table to be
/// crossed upwards: a test that migrated below it with drugs goes back up with <see cref="MigrateToLatestAsync"/>.
/// </summary>
public static class MigrationData
{
    /// <summary>The migration of the shared catalog (by name: EF finds the migration id).</summary>
    public const string AddSharedCatalog = "AddSharedCatalog";

    /// <summary>A test category (the bare template has none) for the drugs of a migration test.</summary>
    public static async Task<int> TestCategoryAsync(AppFixture app) => (await app.Data.Category()).Id;

    /// <summary>
    /// Back to the latest version from any version at or after <c>AddSearchNames</c>: to <c>RenameGroupsToProtocols</c>
    /// first, then every protocol line and drug deleted (by SQL: below <c>AddSharedCatalog</c> the app's model doesn't
    /// match the database), then up (§ 5: <c>AddSharedCatalog</c> assumes an empty <c>Drugs</c> table).
    /// </summary>
    public static async Task MigrateToLatestAsync(AppFixture app)
    {
        await RenameMigrationKit.MigrateAsync(app, RenameMigrationKit.Rename);
        await DeleteDrugsAsync(app);
        await RenameMigrationKit.MigrateAsync(app, null);
    }

    /// <summary>Deletes every protocol line and drug by SQL (table names of <c>RenameGroupsToProtocols</c> and later).</summary>
    public static async Task DeleteDrugsAsync(AppFixture app)
    {
        await app.OutsideTheApp.ExecuteAsync("""DELETE FROM "ProtocolItems" """);
        await app.OutsideTheApp.ExecuteAsync("""DELETE FROM "Drugs" """);
    }
}
