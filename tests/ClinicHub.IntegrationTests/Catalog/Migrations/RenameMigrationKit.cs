using ClinicHub.IntegrationTests.Harness.Hosting;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

namespace ClinicHub.IntegrationTests.Catalog.Migrations;

/// <summary>
/// The migration <c>RenameGroupsToProtocols</c> (design D10, § 5; M1.7a contract "Migration"): tables, column, keys,
/// indexes and identity sequences renamed, and the stored permission keys <c>groups.*</c> → <c>protocols.*</c>.
/// Everything here reads and writes by SQL, because between the two versions the app's model does not match the
/// database (rows "changed outside the app": the app can't write the old schema).
/// </summary>
public static class RenameMigrationKit
{
    /// <summary>The version before the rename (its tables are <c>DrugGroups</c> / <c>DrugGroupItems</c>).</summary>
    public const string Before = "AddSearchNames";
    /// <summary>The rename itself (by name: EF finds the migration id).</summary>
    public const string Rename = "RenameGroupsToProtocols";

    /// <summary>The protocol tables' names on one side of the migration.</summary>
    public sealed record Names(string Protocols, string Items, string ForeignKey);

    public static readonly Names Old = new("DrugGroups", "DrugGroupItems", "DrugGroupId");
    public static readonly Names New = new("Protocols", "ProtocolItems", "ProtocolId");

    /// <summary>Constraints, indexes and sequences of the two tables after the migration (contract table).</summary>
    public static readonly string[] NewConstraints =
    [
        "PK_Protocols", "AK_Protocols_Id_ClinicId", "FK_Protocols_Clinics_ClinicId",
        "PK_ProtocolItems", "FK_ProtocolItems_Clinics_ClinicId", "FK_ProtocolItems_Protocols_ProtocolId_ClinicId",
        "FK_ProtocolItems_Drugs_DrugId_ClinicId",
    ];

    public static readonly string[] NewIndexes =
    [
        "PK_Protocols", "AK_Protocols_Id_ClinicId", "IX_Protocols_ClinicId_Name",
        "PK_ProtocolItems", "IX_ProtocolItems_ClinicId", "IX_ProtocolItems_ProtocolId_ClinicId", "IX_ProtocolItems_DrugId_ClinicId",
    ];

    public static readonly string[] NewSequences = ["Protocols_Id_seq", "ProtocolItems_Id_seq"];

    /// <summary>The same objects before the migration (as <c>Initial</c> created them).</summary>
    public static readonly string[] OldConstraints =
    [
        "PK_DrugGroups", "AK_DrugGroups_Id_ClinicId", "FK_DrugGroups_Clinics_ClinicId",
        "PK_DrugGroupItems", "FK_DrugGroupItems_Clinics_ClinicId", "FK_DrugGroupItems_DrugGroups_DrugGroupId_ClinicId",
        "FK_DrugGroupItems_Drugs_DrugId_ClinicId",
    ];

    public static readonly string[] OldIndexes =
    [
        "PK_DrugGroups", "AK_DrugGroups_Id_ClinicId", "IX_DrugGroups_ClinicId_Name",
        "PK_DrugGroupItems", "IX_DrugGroupItems_ClinicId", "IX_DrugGroupItems_DrugGroupId_ClinicId", "IX_DrugGroupItems_DrugId_ClinicId",
    ];

    public static readonly string[] OldSequences = ["DrugGroups_Id_seq", "DrugGroupItems_Id_seq"];

    /// <summary>Migrates the collection's database to <paramref name="target"/> (null = the latest).</summary>
    public static Task MigrateAsync(AppFixture app, string target) =>
        app.QueryDbAsync(async db =>
        {
            await db.GetService<IMigrator>().MigrateAsync(target);
            return true;
        });

    /// <summary>
    /// Every protocol and line, each column (lines: id, protocol, clinic, drug, order, every override field, stamps),
    /// one text per row, sorted (ordinal): equal snapshots = nothing lost or changed.
    /// </summary>
    public static async Task<List<string>> ProtocolRowsAsync(AppFixture app, Names names)
    {
        var sql = $"""
            SELECT coalesce(string_agg(r, E'\n' ORDER BY r), '') FROM (
              SELECT format('P|%s|%s|%L|%s|%s', p."Id", p."ClinicId", p."Name", p."CreatedAt", p."UpdatedAt") AS r
              FROM "{names.Protocols}" p
              UNION ALL
              SELECT format('I|%s|%s|%s|%s|%s|%L|%L|%L|%L|%L|%L|%L|%L|%L|%s|%s',
                  i."Id", i."{names.ForeignKey}", i."ClinicId", i."DrugId", i."Order",
                  i."Dosing_DoseAmount", i."Dosing_DoseUnit", i."Dosing_Frequency", i."Dosing_FrequencyValue",
                  i."Dosing_FrequencyText", i."Dosing_DurationValue", i."Dosing_DurationUnit", i."Dosing_Eye",
                  i."Dosing_TaperSteps", i."CreatedAt", i."UpdatedAt")
              FROM "{names.Items}" i
            ) rows
            """;
        var text = await app.OutsideTheApp.ScalarAsync<string>(sql);
        return string.IsNullOrEmpty(text) ? [] : text.Split('\n').Order(StringComparer.Ordinal).ToList();
    }

    /// <summary>Every stored permission row as <c>roleId:key</c>, sorted (ordinal).</summary>
    public static async Task<List<string>> PermissionRowsAsync(AppFixture app)
    {
        var text = await app.OutsideTheApp.ScalarAsync<string>(
            """SELECT coalesce(string_agg(format('%s:%s', "RoleId", "Permission"), E'\n' ORDER BY "RoleId", "Permission"), '') FROM "RolePermissions" """);
        return string.IsNullOrEmpty(text) ? [] : text.Split('\n').Order(StringComparer.Ordinal).ToList();
    }

    /// <summary>One role's stored keys, sorted (ordinal).</summary>
    public static async Task<List<string>> RoleKeysAsync(AppFixture app, int roleId)
    {
        var text = await app.OutsideTheApp.ScalarAsync<string>(
            """SELECT coalesce(string_agg("Permission", E'\n' ORDER BY "Permission"), '') FROM "RolePermissions" WHERE "RoleId" = @p0""", roleId);
        return string.IsNullOrEmpty(text) ? [] : text.Split('\n').Order(StringComparer.Ordinal).ToList();
    }

    /// <summary>Replaces a role's stored keys with exactly <paramref name="keys"/> (as a role saved before M1.7a holds them).</summary>
    public static async Task SetRoleKeysAsync(AppFixture app, int roleId, params string[] keys)
    {
        await app.OutsideTheApp.ExecuteAsync("""DELETE FROM "RolePermissions" WHERE "RoleId" = @p0""", roleId);
        foreach (var key in keys)
            await app.OutsideTheApp.ExecuteAsync("""INSERT INTO "RolePermissions" ("RoleId", "Permission") VALUES (@p0, @p1)""", roleId, key);
    }

    /// <summary>A role inserted by SQL (e.g. in the template, which the role use cases don't serve).</summary>
    public static Task<int> InsertRoleAsync(AppFixture app, int clinicId, string name) =>
        app.OutsideTheApp.ScalarAsync<int>(
            """INSERT INTO "Roles" ("ClinicId", "Name", "IsOwner", "CreatedAt", "UpdatedAt") VALUES (@p0, @p1, false, now(), now()) RETURNING "Id" """,
            clinicId, name);

    /// <summary>Names (sorted) of the public tables among <paramref name="tables"/>.</summary>
    public static async Task<List<string>> ExistingTablesAsync(AppFixture app, params string[] tables) =>
        await ListAsync(app, """SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'""", tables);

    /// <summary>Whether <paramref name="table"/> has the column <paramref name="column"/>.</summary>
    public static async Task<bool> HasColumnAsync(AppFixture app, string table, string column) =>
        await app.OutsideTheApp.ScalarAsync<int>(
            """SELECT count(*)::int FROM information_schema.columns WHERE table_schema = 'public' AND table_name = @p0 AND column_name = @p1""",
            table, column) == 1;

    /// <summary>Constraint names (PK, AK, FK…) of the public schema that are among <paramref name="names"/> or contain "DrugGroup".</summary>
    public static Task<List<string>> ConstraintsAsync(AppFixture app, params string[] names) =>
        ListAsync(app, """SELECT c.conname FROM pg_constraint c JOIN pg_namespace n ON n.oid = c.connamespace WHERE n.nspname = 'public'""", names);

    /// <summary>Index names of the public schema that are among <paramref name="names"/> or contain "DrugGroup".</summary>
    public static Task<List<string>> IndexesAsync(AppFixture app, params string[] names) =>
        ListAsync(app, """SELECT indexname FROM pg_indexes WHERE schemaname = 'public'""", names);

    /// <summary>Sequence names of the public schema that are among <paramref name="names"/> or contain "DrugGroup".</summary>
    public static Task<List<string>> SequencesAsync(AppFixture app, params string[] names) =>
        ListAsync(app, """SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE c.relkind = 'S' AND n.nspname = 'public'""", names);

    /// <summary>Every name containing "DrugGroup" left anywhere in the public schema (tables, columns, constraints, indexes, sequences).</summary>
    public static async Task<List<string>> DrugGroupLeftoversAsync(AppFixture app)
    {
        var text = await app.OutsideTheApp.ScalarAsync<string>(
            """
            SELECT coalesce(string_agg(name, ',' ORDER BY name), '') FROM (
              SELECT table_name AS name FROM information_schema.tables WHERE table_schema = 'public'
              UNION ALL SELECT table_name || '.' || column_name FROM information_schema.columns WHERE table_schema = 'public' AND column_name LIKE '%DrugGroup%'
              UNION ALL SELECT c.conname FROM pg_constraint c JOIN pg_namespace n ON n.oid = c.connamespace WHERE n.nspname = 'public'
              UNION ALL SELECT indexname FROM pg_indexes WHERE schemaname = 'public'
              UNION ALL SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE c.relkind = 'S' AND n.nspname = 'public'
            ) names WHERE name LIKE '%DrugGroup%'
            """);
        return string.IsNullOrEmpty(text) ? [] : text.Split(',').Order(StringComparer.Ordinal).ToList();
    }

    /// <summary>The <c>groups.</c> → <c>protocols.</c> rewrite of the stored rows (D10), applied to a snapshot.</summary>
    public static List<string> Renamed(IEnumerable<string> rows, string from, string to) =>
        rows.Select(row =>
        {
            var at = row.IndexOf(':');
            var key = row[(at + 1)..];
            return key.StartsWith(from, StringComparison.Ordinal) ? row[..(at + 1)] + to + key[from.Length..] : row;
        }).Order(StringComparer.Ordinal).ToList();

    private static async Task<List<string>> ListAsync(AppFixture app, string select, string[] names)
    {
        var text = await app.OutsideTheApp.ScalarAsync<string>(
            $"""SELECT coalesce(string_agg(name, ',' ORDER BY name), '') FROM ({select}) AS objects(name) WHERE name = ANY(@p0) OR name LIKE '%DrugGroup%'""",
            (object)names);
        return string.IsNullOrEmpty(text) ? [] : text.Split(',').Order(StringComparer.Ordinal).ToList();
    }
}
