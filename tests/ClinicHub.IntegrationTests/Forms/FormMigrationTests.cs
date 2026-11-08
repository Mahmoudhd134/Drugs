using ClinicHub.IntegrationTests.Catalog;
using ClinicHub.IntegrationTests.Harness.Hosting;
using Microsoft.EntityFrameworkCore;
using Shouldly;
using static ClinicHub.IntegrationTests.Catalog.Migrations.RenameMigrationKit;

namespace ClinicHub.IntegrationTests.Forms;

/// <summary>
/// <c>AddForms</c> (design dynamic-forms § 4.1, contract § 5), up → down → up on a database at the migration before it. In the migration collection: it
/// migrates its database down and up again, so it has a database of its own. Reads by SQL (between versions the app's model doesn't match the database)
/// and leaves its database at the latest version.
/// </summary>
[Collection(CatalogMigrationCollection.Name)]
[Trait("Area", "forms")]
public class FormMigrationTests(BareAppFixture app) : IntegrationTest(app)
{
    private const string Migration = "AddForms";
    private const string Previous = "AddAttachments";
    private const string FormsTable = "Forms";
    private const string VersionsTable = "FormVersions";
    private const string ActiveForeignKey = "FK_Forms_FormVersions_Active";

    [Fact]
    [Trait("Case", "FRM-116")]
    [Trait("Case", "FRM-117")]
    [Trait("Case", "FRM-118")]
    public async Task Up_down_and_up_make_both_tables_as_designed_and_change_nothing_else()
    {
        // Rows in the other tables, and a form that going down must take with it (the two tables reference each other)
        var clinic = await Data.Clinic();
        await Data.Staff(clinic);
        await Data.Form();
        var rows = await OtherTablesRowsAsync();
        rows.ShouldContain(row => row.StartsWith("Clinics=", StringComparison.Ordinal));

        try
        {
            await MigrateAsync(App, Previous);
            (await ExistingTablesAsync(App, FormsTable, VersionsTable)).ShouldBeEmpty("the tables at the migration before it");
            (await OtherTablesRowsAsync()).ShouldBe(rows, "other tables after going down to the migration before it");
            var otherTables = await OtherTableNamesAsync();
            var otherSchema = await SchemaAsync(otherTables);

            await MigrateAsync(App, Migration);
            await TheTablesShouldBeAsDesignedAsync();
            (await OtherTablesRowsAsync()).ShouldBe(rows, "other tables after up");
            (await SchemaAsync(otherTables)).ShouldBe(otherSchema, "other tables' schema after up");
            foreach (var table in new[] { FormsTable, VersionsTable })
                (await App.OutsideTheApp.ScalarAsync<int>($"""SELECT count(*)::int FROM "{table}" """)).ShouldBe(0, $"{table} is new and empty");
            var schema = await SchemaAsync(FormsTable, VersionsTable);

            await MigrateAsync(App, Previous);
            (await ExistingTablesAsync(App, FormsTable, VersionsTable)).ShouldBeEmpty("the tables after down");
            (await ConstraintsAsync(App, ActiveForeignKey)).ShouldBeEmpty("the constraint after down");
            (await OtherTablesRowsAsync()).ShouldBe(rows, "other tables after down");
            (await SchemaAsync(otherTables)).ShouldBe(otherSchema, "other tables' schema after down");

            await MigrateAsync(App, Migration);
            await TheTablesShouldBeAsDesignedAsync();
            (await SchemaAsync(FormsTable, VersionsTable)).ShouldBe(schema, "the same schema after up again");
            (await OtherTablesRowsAsync()).ShouldBe(rows, "other tables after up again");
            (await SchemaAsync(otherTables)).ShouldBe(otherSchema, "other tables' schema after up again");
        }
        finally
        {
            await MigrateAsync(App, null);
        }

        (await App.QueryDbAsync(db => db.Database.GetPendingMigrationsAsync())).ShouldBeEmpty("pending migrations");
        (await App.QueryDbAsync(db => Task.FromResult(db.Database.HasPendingModelChanges()))).ShouldBeFalse("pending model changes");

        // The app works on the tables
        var form = await Data.Form();
        (await App.FormRowAsync(form.Id)).ActiveVersionNumber.ShouldBe(1);
        (await App.VersionRowsAsync(form.Id)).ShouldHaveSingleItem();
    }

    [Fact]
    [Trait("Case", "FRM-115")]
    public Task The_active_versions_foreign_key_is_deferrable_and_initially_deferred() =>
        TheActiveForeignKeyShouldBeDeferredAsync();

    private async Task TheTablesShouldBeAsDesignedAsync()
    {
        (await ExistingTablesAsync(App, FormsTable, VersionsTable)).ShouldBe([FormsTable, VersionsTable], ignoreOrder: true);

        foreach (var (table, column, type, nullable) in new[]
        {
            (FormsTable, "Id", "integer", "NO"),
            (FormsTable, "Name", "character varying", "NO"),
            (FormsTable, "SearchName", "text", "NO"),
            (FormsTable, "ActiveVersionNumber", "integer", "NO"),
            (FormsTable, "IsDeleted", "boolean", "NO"),
            (FormsTable, "DeletedAt", "timestamp with time zone", "YES"),
            (FormsTable, "CreatedAt", "timestamp with time zone", "NO"),
            (FormsTable, "UpdatedAt", "timestamp with time zone", "NO"),
            (VersionsTable, "FormId", "integer", "NO"),
            (VersionsTable, "VersionNumber", "integer", "NO"),
            (VersionsTable, "Definition", "text", "NO"),
            (VersionsTable, "CreatedAt", "timestamp with time zone", "NO"),
            (VersionsTable, "UpdatedAt", "timestamp with time zone", "NO"),
        })
        {
            (await App.OutsideTheApp.ScalarAsync<string>(
                """SELECT data_type || '/' || is_nullable FROM information_schema.columns WHERE table_schema = 'public' AND table_name = @p0 AND column_name = @p1""", table, column))
                .ShouldBe($"{type}/{nullable}", $"{table}.{column}");
        }

        (await App.OutsideTheApp.ScalarAsync<int>(
            """SELECT character_maximum_length FROM information_schema.columns WHERE table_schema = 'public' AND table_name = @p0 AND column_name = 'Name'""", FormsTable))
            .ShouldBe(256, "Name's length");
        (await App.OutsideTheApp.ScalarAsync<string>(
            """SELECT column_default FROM information_schema.columns WHERE table_schema = 'public' AND table_name = @p0 AND column_name = 'IsDeleted'""", FormsTable))
            .ShouldBe("false", "IsDeleted's default");
        (await HasColumnAsync(App, FormsTable, "ClinicId")).ShouldBeFalse("platform rows have no clinic");
        (await HasColumnAsync(App, VersionsTable, "ClinicId")).ShouldBeFalse("platform rows have no clinic");

        (await App.OutsideTheApp.ScalarAsync<string>(
            $"""SELECT pg_get_constraintdef(c.oid) FROM pg_constraint c WHERE c.contype = 'p' AND c.conrelid = '"{VersionsTable}"'::regclass"""))
            .ShouldBe("""PRIMARY KEY ("FormId", "VersionNumber")""");
        (await App.OutsideTheApp.ScalarAsync<string>(
            $"""SELECT c.confdeltype::text FROM pg_constraint c WHERE c.contype = 'f' AND c.conrelid = '"{VersionsTable}"'::regclass AND c.confrelid = '"{FormsTable}"'::regclass"""))
            .ShouldBe("r", "the foreign key to Forms restricts deletes");

        await TheActiveForeignKeyShouldBeDeferredAsync();
    }

    private async Task TheActiveForeignKeyShouldBeDeferredAsync() =>
        (await App.OutsideTheApp.ScalarAsync<string>(
            $"""SELECT pg_get_constraintdef(c.oid) FROM pg_constraint c WHERE c.conname = @p0 AND c.conrelid = '"{FormsTable}"'::regclass""", ActiveForeignKey))
            .ShouldBe("""FOREIGN KEY ("Id", "ActiveVersionNumber") REFERENCES "FormVersions"("FormId", "VersionNumber") DEFERRABLE INITIALLY DEFERRED""");

    private async Task<string[]> OtherTableNamesAsync() =>
        (await App.OutsideTheApp.ScalarAsync<string>(
            """
            SELECT string_agg(table_name, ',' ORDER BY table_name) FROM information_schema.tables
            WHERE table_schema = 'public' AND table_type = 'BASE TABLE' AND table_name NOT IN ('__EFMigrationsHistory', 'Forms', 'FormVersions')
            """)).Split(',');

    /// <summary>The columns, constraints and indexes of <paramref name="tables"/>, one line each, sorted: equal snapshots = the same schema.</summary>
    private Task<string> SchemaAsync(params string[] tables) =>
        App.OutsideTheApp.ScalarAsync<string>(
            """
            SELECT coalesce(string_agg(line, E'\n' ORDER BY line), '') FROM (
              SELECT concat_ws('|', 'column', table_name, column_name, data_type, is_nullable, character_maximum_length, column_default, identity_generation) AS line
              FROM information_schema.columns WHERE table_schema = 'public' AND table_name = ANY(@p0)
              UNION ALL
              SELECT concat_ws('|', 'constraint', r.relname, c.conname, pg_get_constraintdef(c.oid))
              FROM pg_constraint c JOIN pg_class r ON r.oid = c.conrelid JOIN pg_namespace n ON n.oid = r.relnamespace
              WHERE n.nspname = 'public' AND r.relname = ANY(@p0)
              UNION ALL
              SELECT concat_ws('|', 'index', tablename, indexdef) FROM pg_indexes WHERE schemaname = 'public' AND tablename = ANY(@p0)
            ) lines
            """, (object)tables);

    /// <summary>Every other public table as <c>name=count:checksum</c>, sorted: equal snapshots = no row changed.</summary>
    private async Task<List<string>> OtherTablesRowsAsync()
    {
        var rows = new List<string>();
        foreach (var table in await OtherTableNamesAsync())
        {
            // The table name comes from the catalog, never input
            var checksum = await App.OutsideTheApp.ScalarAsync<string>(
                $"""SELECT count(*)::text || ':' || coalesce(md5(string_agg(t::text, E'\n' ORDER BY t::text)), '') FROM "{table}" t""");
            rows.Add($"{table}={checksum}");
        }

        return rows;
    }
}
