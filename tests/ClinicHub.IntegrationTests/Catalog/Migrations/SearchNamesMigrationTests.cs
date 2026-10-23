using ClinicHub.Application.Common.Search;
using ClinicHub.Infrastructure.Database;
using ClinicHub.IntegrationTests.Harness.Builders;
using ClinicHub.IntegrationTests.Harness.Hosting;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using Shouldly;

namespace ClinicHub.IntegrationTests.Catalog.Migrations;

/// <summary>
/// DRUG-101 (overview § Migrations: <c>AddSearchNames</c> computes the column for existing rows, down drops it; tested
/// up → down → up with data). In the migration collection (bare template, no catalog: design M1.7 D12): the rows
/// written before <c>AddSearchNames</c> get their generated <c>SearchName</c> at once (read by SQL at that version);
/// <c>AddSharedCatalog</c> needs an empty <c>Drugs</c> table (§ 5), so the test deletes its drugs before going back to
/// the latest version. Leaves its database migrated to the latest version.
/// </summary>
[Collection(CatalogMigrationCollection.Name)]
[Trait("Area", "catalog")]
public class SearchNamesMigrationTests(BareAppFixture app) : CatalogTest(app)
{
    private const string BeforeSearchNames = "20261014214338_AddClinicDeletedAt";
    // The protocol tables carry their old names before RenameGroupsToProtocols (design D10): DrugGroups, DrugGroupItems
    private static readonly string[] SearchedTablesBefore = ["Drugs", "DrugGroups", "Clinics", "Staff"];
    private static readonly string[] SearchedTablesAfter = ["Drugs", "Protocols", "Clinics", "Staff"];
    private static readonly string[] TablesBefore = [.. SearchedTablesBefore, "DrugGroupItems", "Users", "Roles"];
    private static readonly string[] TablesAfter = [.. SearchedTablesAfter, "ProtocolItems", "Users", "Roles"];

    [Fact]
    [Trait("Case", "DRUG-101")]
    public async Task Existing_rows_get_their_search_name_when_AddSearchNames_is_applied_and_down_then_up_keeps_every_row()
    {
        var n = Unique.Next();
        var category = await MigrationData.TestCategoryAsync(App);
        var clinic = await Data.Clinic().Named($"عيادة الأمل {n}");
        var staff = await Data.Staff(clinic).Named($"أحمد مؤمن {n}");
        var drug = await Data.Drug(clinic).Named($"أسبرين ممتد {n}").InCategory(category);
        var protocol = await Data.Protocol(clinic).Named($"بروتوكول إلتهاب {n}").With(drug);
        var before = (await CountRowsAsync(TablesAfter)).Values.ToList();

        try
        {
            // The database as it was before AddSearchNames, with its rows
            await MigrateAsync(BeforeSearchNames);
            foreach (var table in SearchedTablesBefore)
                (await HasSearchNameAsync(table)).ShouldBeFalse($"{table}.SearchName after migrating down");
            (await CountRowsAsync(TablesBefore)).Values.ToList().ShouldBe(before, "rows after migrating down");

            // AddSearchNames (up to RenameGroupsToProtocols) applied to the existing rows: generated at once
            await MigrateAsync(RenameMigrationKit.Rename);

            foreach (var table in SearchedTablesAfter)
                (await HasSearchNameAsync(table)).ShouldBeTrue($"{table}.SearchName after migrating up");
            (await CountRowsAsync(TablesAfter)).Values.ToList().ShouldBe(before, "rows after migrating up");
            (await StoredSearchNameAsync("Drugs", drug.Id)).ShouldBe(SearchText.Fold(drug.Name), "Drugs.SearchName");
            (await StoredSearchNameAsync("Protocols", protocol.Id)).ShouldBe(SearchText.Fold(protocol.Name), "Protocols.SearchName");
            (await StoredSearchNameAsync("Clinics", clinic.Id)).ShouldBe(SearchText.Fold(clinic.Name), "Clinics.SearchName");
            (await StoredSearchNameAsync("Staff", staff.Id)).ShouldBe(SearchText.Fold(staff.FullName), "Staff.SearchName");
        }
        finally
        {
            // AddSharedCatalog needs an empty Drugs table: the drugs are deleted, then the latest version
            await MigrationData.MigrateToLatestAsync(App);
        }

        (await App.QueryDbAsync(db => db.Database.GetPendingMigrationsAsync())).ShouldBeEmpty("pending migrations");
        (await App.QueryDbAsync(db => db.Drugs.IgnoreQueryFilters().CountAsync())).ShouldBe(0, "drugs after the test deleted them");
        (await App.QueryDbAsync(db => db.Clinics.CountAsync(c => c.Id == clinic.Id))).ShouldBe(1, "the clinic kept");
    }

    /// <summary>The stored <c>SearchName</c> of one row (read by SQL: the app's model may not match this version).</summary>
    private Task<string> StoredSearchNameAsync(string table, int id) =>
        // The table name is one of the constants above, never input
        App.OutsideTheApp.ScalarAsync<string>("SELECT \"SearchName\" FROM \"" + table + "\" WHERE \"Id\" = @p0", id);

    private Task MigrateAsync(string target) =>
        App.QueryDbAsync(async db =>
        {
            await db.GetService<IMigrator>().MigrateAsync(target);
            return true;
        });

    private Task<bool> HasSearchNameAsync(string table) =>
        App.QueryDbAsync(async db => await db.Database.SqlQuery<int>(
                $"SELECT count(*)::int AS \"Value\" FROM information_schema.columns WHERE table_schema = 'public' AND table_name = {table} AND column_name = 'SearchName'")
            .SingleAsync() == 1);

    /// <summary>Row counts in the order of <paramref name="tables"/> (the same tables under their names of that version).</summary>
    private Task<Dictionary<string, int>> CountRowsAsync(string[] tables) =>
        App.QueryDbAsync(async db =>
        {
            var counts = new Dictionary<string, int>();
            foreach (var table in tables)
                counts[table] = await CountAsync(db, table);
            return counts;
        });

    private static Task<int> CountAsync(AppDbContext db, string table)
    {
        // The table name is one of the constants above, never input
        var sql = "SELECT count(*)::int AS \"Value\" FROM \"" + table + "\"";
        return db.Database.SqlQueryRaw<int>(sql).SingleAsync();
    }
}
