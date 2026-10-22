using ClinicHub.Application.Common.Paging;
using ClinicHub.Application.Features.Access.StaffMembers;
using ClinicHub.Application.Features.Platform.Clinics;
using ClinicHub.Infrastructure.Database;
using ClinicHub.IntegrationTests.Harness.Assertions;
using ClinicHub.IntegrationTests.Harness.Builders;
using ClinicHub.IntegrationTests.Harness.Clients;
using ClinicHub.IntegrationTests.Harness.Hosting;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using Shouldly;

namespace ClinicHub.IntegrationTests.Catalog.Migrations;

/// <summary>
/// DRUG-101 (overview § Migrations: <c>AddSearchNames</c> computes the column for existing rows, down drops it; tested
/// up → down → up with data). Runs on its collection's own database, which it leaves migrated to the latest version.
/// </summary>
[Collection(CatalogMigrationCollection.Name)]
[Trait("Area", "catalog")]
public class SearchNamesMigrationTests(AppFixture app) : CatalogTest(app)
{
    private const string BeforeSearchNames = "20261014214338_AddClinicDeletedAt";
    private static readonly string[] SearchedTables = ["Drugs", "DrugGroups", "Clinics", "Staff"];
    private static readonly string[] Tables = [.. SearchedTables, "DrugGroupItems", "Users", "Roles"];

    [Fact]
    [Trait("Case", "DRUG-101")]
    public async Task Existing_rows_are_searchable_once_AddSearchNames_is_applied_and_down_then_up_keeps_them()
    {
        var n = Unique.Next();
        var clinic = await Data.Clinic().Named($"عيادة الأمل {n}");
        var staff = await Data.Staff(clinic).Named($"أحمد مؤمن {n}");
        var drug = await Data.Drug(clinic).Named($"أسبرين ممتد {n}");
        var group = await Data.Protocol(clinic).Named($"مجموعة إلتهاب {n}").With(drug);
        var before = await CountRowsAsync();

        try
        {
            // The database as it was before AddSearchNames, with its rows
            await MigrateAsync(BeforeSearchNames);
            foreach (var table in SearchedTables)
                (await HasSearchNameAsync(table)).ShouldBeFalse($"{table}.SearchName after migrating down");
            (await CountRowsAsync()).ShouldBe(before, "rows after migrating down");
        }
        finally
        {
            // AddSearchNames (and anything after it) applied to the existing rows
            await MigrateAsync(null);
        }

        foreach (var table in SearchedTables)
            (await HasSearchNameAsync(table)).ShouldBeTrue($"{table}.SearchName after migrating up");
        (await CountRowsAsync()).ShouldBe(before, "rows after migrating up");

        var owner = await Login.OwnerAsync(clinic);
        (await SearchDrugNamesAsync(owner, $"اسبرين ممتد {n}")).ShouldBe([drug.Name]);
        (await SearchProtocolNamesAsync(owner, $"مجموعه التهاب {n}")).ShouldBe([group.Name]);
        var admin = await Login.SuperAdminAsync();
        (await AdminSearchAsync<ClinicSummary>(admin, "/api/v1/admin/clinics", $"عياده الامل {n}"))
            .Items.Select(c => c.Id).ShouldBe([clinic.Id]);
        (await AdminSearchAsync<StaffMemberDto>(admin, $"/api/v1/admin/clinics/{clinic.Id}/staff", $"احمد مومن {n}"))
            .Items.Select(s => s.Id).ShouldBe([staff.Id]);
    }

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

    private Task<Dictionary<string, int>> CountRowsAsync() =>
        App.QueryDbAsync(async db =>
        {
            var counts = new Dictionary<string, int>();
            foreach (var table in Tables)
                counts[table] = await CountAsync(db, table);
            return counts;
        });

    private static Task<int> CountAsync(AppDbContext db, string table)
    {
        // The table name is one of the constants above, never input
        var sql = "SELECT count(*)::int AS \"Value\" FROM \"" + table + "\"";
        return db.Database.SqlQueryRaw<int>(sql).SingleAsync();
    }

    private static async Task<PagedResult<T>> AdminSearchAsync<T>(ApiClient admin, string url, string search)
    {
        var response = await admin.GetAsync($"{url}?search={Uri.EscapeDataString(search)}");
        await response.ShouldBeOkAsync();
        return await response.ReadAsync<PagedResult<T>>();
    }
}
