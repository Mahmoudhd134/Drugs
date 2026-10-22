using ClinicHub.Application.Common.Abstractions;
using ClinicHub.Infrastructure.Database;
using ClinicHub.IntegrationTests.Harness.Databases;
using ClinicHub.IntegrationTests.Harness.Hosting;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Shouldly;

namespace ClinicHub.IntegrationTests.SelfTests;

/// <summary>
/// A scratch copy of the loaded template (what every collection starts from), changed by a self-test and dropped at its
/// end: the run's own databases are never changed, so a normal run's baseline check passes (design M1.7 D12).
/// </summary>
internal sealed class ScratchCopy : IAsyncDisposable
{
    private ScratchCopy(string name) => Name = name;

    public string Name { get; }
    public string ConnectionString => TestRun.ConnectionString(Name);

    /// <summary>Raw SQL on the scratch copy ("changed outside the app").</summary>
    public OutsideTheApp Sql => new(ConnectionString);

    public static async Task<ScratchCopy> CreateAsync() => new(await TestRun.CreateCopyAsync());

    public Task<BaselineViolation> CheckAsync(string lastClass) => BaselineGuard.CheckAsync(ConnectionString, TestRun.Baseline, lastClass);

    public async ValueTask DisposeAsync() => await TestRun.DropAsync(Name);
}

/// <summary>
/// The baseline check (design M1.7 D12, <see cref="BaselineGuard"/>): any change to an imported shared drug, category or
/// subcategory is reported, naming the class that ran, however it was made. No collection database is touched here.
/// </summary>
[Trait("Area", "infra")]
public class BaselineGuardTests
{
    private const string Prefix = "tests never edit imported rows or categories: create your own shared drug or category";
    private const string LastClass = "ClinicHub.IntegrationTests.Probe.EditsTheCatalogTests";

    private static void ShouldBeAViolation(BaselineViolation violation)
    {
        violation.ShouldNotBeNull("the change must be reported");
        violation.LastClass.ShouldBe(LastClass);
        violation.Message.ShouldStartWith(Prefix);
    }

    [Fact]
    [Trait("Case", "CAT-225")]
    public async Task An_imported_drug_changed_through_EF_is_reported_and_a_copy_recreated_from_the_template_passes()
    {
        await using (var changed = await ScratchCopy.CreateAsync())
        {
            (await changed.CheckAsync(LastClass)).ShouldBeNull("a fresh copy holds the baseline");
            await using (var factory = await TestRun.StartAppAsync(() => new ClinicHubFactory(changed.ConnectionString), "the scratch app"))
            await using (var scope = factory.Services.CreateAsyncScope())
            using (scope.ServiceProvider.GetRequiredService<IClinicScope>().UseSharedCatalog())
            {
                var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
                var drug = await db.Drugs.SingleAsync(d => d.ClinicId == null && d.Name == "ALEMOX 1 GM 12 F.C.TABS.");
                drug.Description = "Changed by a test through EF";
                await db.SaveChangesAsync();
            }

            ShouldBeAViolation(await changed.CheckAsync(LastClass));
        }

        await using var recreated = await ScratchCopy.CreateAsync();
        (await recreated.CheckAsync(LastClass)).ShouldBeNull();
    }

    [Theory]
    [Trait("Case", "CAT-226")]
    [InlineData(@"UPDATE ""Drugs"" SET ""Name"" = ""Name"" || ' X' WHERE ""Id"" = (SELECT min(""Id"") FROM ""Drugs"" WHERE ""ClinicId"" IS NULL)")]
    [InlineData(@"UPDATE ""Drugs"" SET ""IsWithdrawn"" = TRUE WHERE ""Id"" = (SELECT max(""Id"") FROM ""Drugs"" WHERE ""ClinicId"" IS NULL)")]
    [InlineData(@"UPDATE ""Drugs"" SET ""ActiveIngredients"" = 'X' WHERE ""Id"" = (SELECT min(""Id"") FROM ""Drugs"" WHERE ""ClinicId"" IS NULL AND ""ActiveIngredients"" IS NULL)")]
    public async Task An_imported_drug_changed_by_raw_SQL_without_touching_UpdatedAt_is_reported(string sql)
    {
        await using var scratch = await ScratchCopy.CreateAsync();
        (await scratch.CheckAsync(LastClass)).ShouldBeNull("a fresh copy holds the baseline");

        (await scratch.Sql.ExecuteAsync(sql)).ShouldBe(1);

        ShouldBeAViolation(await scratch.CheckAsync(LastClass));
    }

    [Theory]
    [Trait("Case", "CAT-227")]
    [InlineData(@"UPDATE ""Categories"" SET ""NameEn"" = ""NameEn"" || ' X' WHERE ""Id"" = 17")]
    [InlineData(@"UPDATE ""Categories"" SET ""NameAr"" = ""NameAr"" || ' س' WHERE ""Id"" = 23")]
    [InlineData(@"UPDATE ""SubCategories"" SET ""NameEn"" = ""NameEn"" || ' X' WHERE ""Id"" = 138")]
    // Deleting a used subcategory needs its drugs' foreign key off (what a hand edit could do): replica mode skips it
    [InlineData(@"SET session_replication_role = replica; DELETE FROM ""SubCategories"" WHERE ""Id"" = 182")]
    public async Task An_imported_category_renamed_or_subcategory_deleted_is_reported(string sql)
    {
        await using var scratch = await ScratchCopy.CreateAsync();
        (await scratch.CheckAsync(LastClass)).ShouldBeNull("a fresh copy holds the baseline");

        (await scratch.Sql.ExecuteAsync(sql)).ShouldBeGreaterThan(0);

        ShouldBeAViolation(await scratch.CheckAsync(LastClass));
    }
}
