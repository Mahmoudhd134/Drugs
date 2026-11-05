using ClinicHub.IntegrationTests.Catalog;
using ClinicHub.IntegrationTests.Harness.Hosting;
using Microsoft.EntityFrameworkCore;
using Shouldly;
using static ClinicHub.IntegrationTests.Catalog.Migrations.RenameMigrationKit;

namespace ClinicHub.IntegrationTests.Attachments;

/// <summary>
/// <c>AddAttachments</c> (docs/design/attachments.md § 4), up → down → up on a database at the migration before it. In the migration
/// collection: it migrates its database down and up again, so it has a database of its own. Reads by SQL (between versions the
/// app's model doesn't match the database) and leaves its database at the latest version.
/// </summary>
[Collection(CatalogMigrationCollection.Name)]
[Trait("Area", "attachments")]
public class AttachmentMigrationTests(BareAppFixture app) : IntegrationTest(app)
{
    private const string Migration = "AddAttachments";
    private const string Previous = "AddPrescriptionTemplates";
    private const string Table = "Attachments";

    [Fact]
    [Trait("Case", "ATT-180")]
    public async Task Up_down_and_up_make_the_table_change_no_other_tables_rows_and_leave_no_pending_model_change()
    {
        var clinic = await Data.Clinic();
        await Data.Staff(clinic);
        var rows = await OtherTablesRowsAsync();
        rows.ShouldContain(row => row.StartsWith("Clinics=", StringComparison.Ordinal));

        try
        {
            await MigrateAsync(App, Previous);
            (await ExistingTablesAsync(App, Table)).ShouldBeEmpty("the table at the migration before it");
            (await OtherTablesRowsAsync()).ShouldBe(rows, "other tables after going down");

            await MigrateAsync(App, Migration);
            await TheTableShouldBeAsDesignedAsync();
            (await OtherTablesRowsAsync()).ShouldBe(rows, "other tables after up");
            (await App.OutsideTheApp.ScalarAsync<int>($"""SELECT count(*)::int FROM "{Table}" """)).ShouldBe(0, "a new table is empty");

            await MigrateAsync(App, Previous);
            (await ExistingTablesAsync(App, Table)).ShouldBeEmpty("the table after down");
            (await OtherTablesRowsAsync()).ShouldBe(rows, "other tables after down");

            await MigrateAsync(App, Migration);
            await TheTableShouldBeAsDesignedAsync();
            (await OtherTablesRowsAsync()).ShouldBe(rows, "other tables after up again");
        }
        finally
        {
            await MigrateAsync(App, null);
        }

        (await App.QueryDbAsync(db => db.Database.GetPendingMigrationsAsync())).ShouldBeEmpty("pending migrations");
        (await App.QueryDbAsync(db => Task.FromResult(db.Database.HasPendingModelChanges()))).ShouldBeFalse("pending model changes");
        (await App.QueryDbAsync(db => db.Attachments.IgnoreQueryFilters().CountAsync())).ShouldBe(0);
    }

    private async Task TheTableShouldBeAsDesignedAsync()
    {
        (await ExistingTablesAsync(App, Table)).ShouldBe([Table]);
        foreach (var (column, type, nullable) in new[]
        {
            ("Id", "uuid", "NO"),
            ("ClinicId", "integer", "YES"),
            ("Module", "character varying", "NO"),
            ("RefId", "character varying", "NO"),
            ("OriginalFileName", "character varying", "NO"),
            ("TypeKey", "character varying", "NO"),
            ("SizeBytes", "bigint", "NO"),
            ("StorageKey", "character varying", "NO"),
            ("CreatedByUserId", "integer", "NO"),
            ("DeletedAt", "timestamp with time zone", "YES"),
            ("DeletedByUserId", "integer", "YES"),
            ("CreatedAt", "timestamp with time zone", "NO"),
            ("UpdatedAt", "timestamp with time zone", "NO"),
        })
        {
            (await App.OutsideTheApp.ScalarAsync<string>(
                """SELECT data_type || '/' || is_nullable FROM information_schema.columns WHERE table_schema = 'public' AND table_name = @p0 AND column_name = @p1""", Table, column))
                .ShouldBe($"{type}/{nullable}", column);
        }

        foreach (var (column, length) in new[] { ("Module", 50), ("RefId", 64), ("OriginalFileName", 256), ("TypeKey", 20), ("StorageKey", 200) })
        {
            (await App.OutsideTheApp.ScalarAsync<int>(
                """SELECT character_maximum_length FROM information_schema.columns WHERE table_schema = 'public' AND table_name = @p0 AND column_name = @p1""", Table, column))
                .ShouldBe(length, column);
        }

        (await App.OutsideTheApp.ScalarAsync<int>(
            """SELECT count(*)::int FROM pg_indexes WHERE schemaname = 'public' AND tablename = @p0 AND indexdef LIKE 'CREATE UNIQUE INDEX%' AND indexdef LIKE '%("StorageKey")%'""", Table))
            .ShouldBe(1, "a unique index on StorageKey");
        (await App.OutsideTheApp.ScalarAsync<int>(
            """SELECT count(*)::int FROM pg_indexes WHERE schemaname = 'public' AND tablename = @p0 AND indexdef LIKE '%("ClinicId", "Module", "RefId")%'""", Table))
            .ShouldBe(1, "the index on the clinic, module and ref ID");
        (await App.OutsideTheApp.ScalarAsync<string>(
            $"""SELECT c.confdeltype::text FROM pg_constraint c WHERE c.contype = 'f' AND c.conrelid = '"{Table}"'::regclass AND c.confrelid = '"Clinics"'::regclass"""))
            .ShouldBe("r", "the foreign key to Clinics restricts deletes");
        (await App.OutsideTheApp.ScalarAsync<string>(
            $"""SELECT string_agg(c.confdeltype::text, ',') FROM pg_constraint c WHERE c.contype = 'f' AND c.conrelid = '"{Table}"'::regclass AND c.confrelid = '"Users"'::regclass"""))
            .ShouldBe("r,r", "both foreign keys to Users restrict deletes");
    }

    /// <summary>Every other public table as <c>name=count:checksum</c>, sorted: equal snapshots = no row changed.</summary>
    private async Task<List<string>> OtherTablesRowsAsync()
    {
        var tables = await App.OutsideTheApp.ScalarAsync<string>(
            """
            SELECT string_agg(table_name, ',' ORDER BY table_name) FROM information_schema.tables
            WHERE table_schema = 'public' AND table_type = 'BASE TABLE' AND table_name NOT IN ('__EFMigrationsHistory', 'Attachments')
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
