using System.Net;
using ClinicHub.IntegrationTests.Catalog;
using ClinicHub.IntegrationTests.Catalog.Migrations;
using ClinicHub.IntegrationTests.Harness.Assertions;
using ClinicHub.IntegrationTests.Harness.Hosting;
using Microsoft.EntityFrameworkCore;
using Shouldly;
using static ClinicHub.IntegrationTests.Catalog.Migrations.RenameMigrationKit;

namespace ClinicHub.IntegrationTests.Admin.PrescriptionTemplates;

/// <summary>
/// <c>AddPrescriptionTemplates</c> (design D2, § 5; contract § 1.1), up → down → up on a database at the migration before
/// it. In the migration collection: it migrates its database down and up again, so it has a database of its own. Reads by
/// SQL (between versions the app's model doesn't match the database) and leaves its database at the latest version.
/// </summary>
[Collection(CatalogMigrationCollection.Name)]
[Trait("Area", "admin")]
public class TemplateMigrationTests(BareAppFixture app) : IntegrationTest(app)
{
    private const string Migration = "AddPrescriptionTemplates";
    private const string Previous = MigrationData.AddSharedCatalog;
    private const string Table = "PrescriptionTemplates";

    [Fact]
    [Trait("Case", "TPL-200")]
    public async Task Up_down_and_up_make_the_table_and_no_other_tables_rows_change()
    {
        // Rows in the other tables, and a template that going down must take with it
        var admin = await Login.SuperAdminAsync();
        var clinic = await Data.Clinic();
        await Data.Staff(clinic);
        await admin.SaveTemplateAsync(clinic.Id, LayoutBuilder.L());
        var rows = await OtherTablesRowsAsync();
        rows.ShouldContain(row => row.StartsWith("Clinics=", StringComparison.Ordinal));

        try
        {
            await MigrateAsync(App, Previous);
            (await ExistingTablesAsync(App, Table)).ShouldBeEmpty("the table at the migration before it");
            (await OtherTablesRowsAsync()).ShouldBe(rows, "other tables after going down to the migration before it");

            await MigrateAsync(App, Migration);
            await TheTableShouldBeAsTheContractSaysAsync();
            (await OtherTablesRowsAsync()).ShouldBe(rows, "other tables after up");
            (await App.OutsideTheApp.ScalarAsync<int>($"""SELECT count(*)::int FROM "{Table}" """)).ShouldBe(0, "a new table is empty");

            await MigrateAsync(App, Previous);
            (await ExistingTablesAsync(App, Table)).ShouldBeEmpty("the table after down");
            (await OtherTablesRowsAsync()).ShouldBe(rows, "other tables after down");

            await MigrateAsync(App, Migration);
            await TheTableShouldBeAsTheContractSaysAsync();
            (await OtherTablesRowsAsync()).ShouldBe(rows, "other tables after up again");
        }
        finally
        {
            await MigrateAsync(App, null);
        }

        (await App.QueryDbAsync(db => db.Database.GetPendingMigrationsAsync())).ShouldBeEmpty("pending migrations");

        // The app works on the table: the clinic starts empty, saves and has one row
        await admin.ShouldHaveNoTemplateAsync(clinic.Id);
        await admin.SaveTemplateAsync(clinic.Id, LayoutBuilder.L());
        await App.TemplateRowAsync(clinic.Id);
        await (await admin.DeleteAsync(LayoutBuilder.Route(clinic.Id))).ShouldBeAsync(HttpStatusCode.NoContent);
    }

    private async Task TheTableShouldBeAsTheContractSaysAsync()
    {
        (await ExistingTablesAsync(App, Table)).ShouldBe([Table]);
        (await App.OutsideTheApp.ScalarAsync<string>(
            """SELECT data_type FROM information_schema.columns WHERE table_schema = 'public' AND table_name = @p0 AND column_name = 'Layout'""", Table))
            .ShouldBe("text", "Layout's type");
        (await App.OutsideTheApp.ScalarAsync<string>(
            """SELECT is_nullable FROM information_schema.columns WHERE table_schema = 'public' AND table_name = @p0 AND column_name = 'Layout'""", Table))
            .ShouldBe("NO", "Layout is required");
        (await App.OutsideTheApp.ScalarAsync<int>(
            """SELECT count(*)::int FROM pg_indexes WHERE schemaname = 'public' AND tablename = @p0 AND indexdef LIKE 'CREATE UNIQUE INDEX%' AND indexdef LIKE '%("ClinicId")%'""", Table))
            .ShouldBe(1, "a unique index on ClinicId alone");
        (await App.OutsideTheApp.ScalarAsync<string>(
            $"""
            SELECT c.confdeltype::text FROM pg_constraint c
            WHERE c.contype = 'f' AND c.conrelid = '"{Table}"'::regclass AND c.confrelid = '"Clinics"'::regclass
            """))
            .ShouldBe("r", "the foreign key to Clinics restricts deletes");
    }

    /// <summary>
    /// Every other public table as <c>name=count:checksum</c> of all its rows and columns, sorted: equal snapshots = no row
    /// changed. Reads the table list each time, so a table created or dropped by the migration shows too.
    /// </summary>
    private async Task<List<string>> OtherTablesRowsAsync()
    {
        // Attachments comes from a later migration: going down to before print templates drops it
        var tables = await App.OutsideTheApp.ScalarAsync<string>(
            """
            SELECT string_agg(table_name, ',' ORDER BY table_name) FROM information_schema.tables
            WHERE table_schema = 'public' AND table_type = 'BASE TABLE' AND table_name NOT IN ('__EFMigrationsHistory', 'PrescriptionTemplates', 'Attachments')
            """);
        var rows = new List<string>();
        foreach (var table in tables.Split(','))
        {
            // The table name comes from the catalog above, never input
            var checksum = await App.OutsideTheApp.ScalarAsync<string>(
                $"""SELECT count(*)::text || ':' || coalesce(md5(string_agg(t::text, E'\n' ORDER BY t::text)), '') FROM "{table}" t""");
            rows.Add($"{table}={checksum}");
        }

        return rows;
    }
}
