using ClinicHub.Application.Common.Search;
using ClinicHub.IntegrationTests.Harness.Hosting;
using Microsoft.EntityFrameworkCore;
using Shouldly;
using static ClinicHub.IntegrationTests.Catalog.Migrations.RenameMigrationKit;

namespace ClinicHub.IntegrationTests.Catalog.Migrations;

/// <summary>
/// <c>AddSharedCatalog</c> (design M1.7 § 5, D7; M1.7b contract § 2.2): schema only, crossed upwards on an empty
/// <c>Drugs</c> table; the four <c>SearchName</c> columns and the new <c>SearchOther</c> are ordinary columns filled by
/// the app, generated columns again after Down. In the migration collection (bare template, no catalog, D12); leaves
/// its database migrated to the latest version.
/// </summary>
[Collection(CatalogMigrationCollection.Name)]
[Trait("Area", "catalog")]
public class SharedCatalogMigrationTests(BareAppFixture app) : IntegrationTest(app)
{
    private static readonly (string Table, string Column)[] SearchColumns =
    [
        ("Drugs", "SearchName"), ("Protocols", "SearchName"), ("Clinics", "SearchName"), ("Staff", "SearchName"),
        ("Drugs", "SearchOther"),
    ];

    [Fact]
    [Trait("Case", "CAT-005")]
    public async Task Down_to_RenameGroupsToProtocols_and_up_again_gives_the_schema_back_and_the_app_fills_SearchOther()
    {
        // "On a database without drugs" (§ 5): AddSharedCatalog is crossed upwards only on an empty Drugs table
        await MigrationData.DeleteDrugsAsync(App);
        try
        {
            await MigrateAsync(App, Rename);
            (await HasColumnAsync(App, "Drugs", "SearchOther")).ShouldBeFalse("Drugs.SearchOther after Down");
            (await ExistingTablesAsync(App, "Categories", "SubCategories")).ShouldBeEmpty("category tables after Down");
        }
        finally
        {
            await MigrateAsync(App, null);
        }

        // The schema is back: a test category, an own drug in it and a protocol line on it save
        var category = await Data.Category();
        var clinic = await Data.Clinic();
        const string ingredients = "MOXIFLOXACIN+DEXAMETHASONE(EYE)";
        var drug = await Data.Drug(clinic).InCategory(category.Id).WithIngredients(ingredients);
        var protocol = await Data.Protocol(clinic).With(drug);

        drug.Category.Id.ShouldBe(category.Id);
        drug.SubCategory.ShouldBeNull();
        protocol.Items.Select(i => i.Drug.Id).ShouldBe([drug.Id]);
        (await StoredAsync(drug.Id, "SearchOther")).ShouldBe(SearchText.OtherText(null, ingredients), "SearchOther filled by the app");
        (await StoredAsync(drug.Id, "SearchName")).ShouldBe(SearchText.Fold(drug.Name), "SearchName filled by the app");
    }

    [Fact]
    [Trait("Case", "CAT-006")]
    public async Task The_search_columns_are_ordinary_columns_and_after_Down_the_four_SearchName_are_generated_again()
    {
        foreach (var (table, column) in SearchColumns)
        {
            var info = await ColumnAsync(table, column);
            info.ShouldNotBeNull($"{table}.{column}");
            info.Generated.ShouldBe("NEVER", $"{table}.{column} is_generated");
            info.Nullable.ShouldBe("NO", $"{table}.{column} is_nullable");
            info.Default.ShouldBe("''::text", $"{table}.{column} default");
        }

        await MigrationData.DeleteDrugsAsync(App);
        try
        {
            await MigrateAsync(App, Rename);

            foreach (var (table, column) in SearchColumns.Where(c => c.Column == "SearchName"))
            {
                var info = await ColumnAsync(table, column);
                info.ShouldNotBeNull($"{table}.{column} after Down");
                info.Generated.ShouldBe("ALWAYS", $"{table}.{column} is_generated after Down");
            }
            (await ColumnAsync("Drugs", "SearchOther")).ShouldBeNull("Drugs.SearchOther after Down");
        }
        finally
        {
            await MigrateAsync(App, null);
        }

        (await ColumnAsync("Drugs", "SearchOther")).ShouldNotBeNull("Drugs.SearchOther after Up again").Generated.ShouldBe("NEVER");
    }

    [Fact]
    [Trait("Case", "CAT-007")]
    public async Task With_the_migrations_applied_no_model_change_is_pending()
    {
        (await App.QueryDbAsync(db => db.Database.GetPendingMigrationsAsync())).ShouldBeEmpty("pending migrations");
        (await App.QueryDbAsync(db => Task.FromResult(db.Database.HasPendingModelChanges())))
            .ShouldBeFalse("the model has changes no migration holds (dotnet ef migrations has-pending-model-changes)");
    }

    private sealed record ColumnInfo(string Generated, string Nullable, string Default);

    /// <summary>The column's <c>information_schema</c> facts, or null when it doesn't exist.</summary>
    private async Task<ColumnInfo> ColumnAsync(string table, string column)
    {
        var text = await App.OutsideTheApp.ScalarAsync<string>(
            """
            SELECT is_generated || '|' || is_nullable || '|' || coalesce(column_default, '<none>')
            FROM information_schema.columns WHERE table_schema = 'public' AND table_name = @p0 AND column_name = @p1
            """, table, column);
        if (text is null)
            return null;
        var parts = text.Split('|');
        return new ColumnInfo(parts[0], parts[1], parts[2]);
    }

    /// <summary>A drug's stored search column (by SQL).</summary>
    private Task<string> StoredAsync(int drugId, string column) =>
        // The column name is one of the constants of this class, never input
        App.OutsideTheApp.ScalarAsync<string>("SELECT \"" + column + "\" FROM \"Drugs\" WHERE \"Id\" = @p0", drugId);
}
