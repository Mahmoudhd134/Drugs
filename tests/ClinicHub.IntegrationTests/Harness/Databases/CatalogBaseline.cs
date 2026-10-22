using Npgsql;

namespace ClinicHub.IntegrationTests.Harness.Databases;

/// <summary>
/// What the loaded template holds after <c>load_catalog.py</c> (design M1.7 D12), recorded once per run by
/// <see cref="TestRun"/>: the max ids of the imported drugs, categories and subcategories, the shared drug count and a
/// checksum of the imported rows' contents (<c>md5(string_agg(t::text, ',' ORDER BY "Id"))</c> over the shared
/// <c>Drugs</c> with <c>Id</c> ≤ <see cref="MaxDrugId"/>, then <c>Categories</c> and <c>SubCategories</c> up to their max
/// ids). Tests read the literal catalog numbers from here (e.g. <see cref="SharedCount"/> = 23,414), never from code.
/// </summary>
public sealed record CatalogBaseline(int MaxDrugId, int MaxCategoryId, int MaxSubCategoryId, int SharedCount, string Checksum)
{
    /// <summary>Reads the baseline of a loaded database (its shared drugs, categories and subcategories as they are now).</summary>
    public static async Task<CatalogBaseline> ReadAsync(string connectionString)
    {
        await using var connection = new NpgsqlConnection(DatabaseGuard.Ensure(connectionString));
        await connection.OpenAsync();
        var (maxDrug, maxCategory, maxSubCategory, shared) = await ReadNumbersAsync(connection, null);
        var checksum = await ChecksumAsync(connection, maxDrug, maxCategory, maxSubCategory);
        return new CatalogBaseline(maxDrug, maxCategory, maxSubCategory, shared, checksum);
    }

    /// <summary>
    /// The max ids and the shared count; with <paramref name="within"/>, only the rows inside that baseline's id ranges
    /// (what the imported rows are now).
    /// </summary>
    internal static async Task<(int MaxDrug, int MaxCategory, int MaxSubCategory, int Shared)> ReadNumbersAsync(
        NpgsqlConnection connection, CatalogBaseline within)
    {
        await using var command = new NpgsqlCommand(
            """
            SELECT (SELECT coalesce(max("Id"), 0) FROM "Drugs" WHERE "ClinicId" IS NULL AND "Id" <= @maxDrug),
                   (SELECT coalesce(max("Id"), 0) FROM "Categories" WHERE "Id" <= @maxCategory),
                   (SELECT coalesce(max("Id"), 0) FROM "SubCategories" WHERE "Id" <= @maxSubCategory),
                   (SELECT count(*)::int FROM "Drugs" WHERE "ClinicId" IS NULL AND "Id" <= @maxDrug)
            """, connection);
        command.Parameters.AddWithValue("maxDrug", within?.MaxDrugId ?? int.MaxValue);
        command.Parameters.AddWithValue("maxCategory", within?.MaxCategoryId ?? int.MaxValue);
        command.Parameters.AddWithValue("maxSubCategory", within?.MaxSubCategoryId ?? int.MaxValue);
        await using var reader = await command.ExecuteReaderAsync();
        await reader.ReadAsync();
        return (reader.GetInt32(0), reader.GetInt32(1), reader.GetInt32(2), reader.GetInt32(3));
    }

    /// <summary>
    /// The checksum of the imported rows: every column of the shared drugs with <c>Id</c> ≤ <paramref name="maxDrug"/>,
    /// of the categories ≤ <paramref name="maxCategory"/> and of the subcategories ≤ <paramref name="maxSubCategory"/>,
    /// in id order. A row's text form holds every column, so a change by raw SQL that keeps <c>UpdatedAt</c> counts too.
    /// </summary>
    internal static async Task<string> ChecksumAsync(NpgsqlConnection connection, int maxDrug, int maxCategory, int maxSubCategory)
    {
        await using var command = new NpgsqlCommand(
            """
            SELECT md5(
                coalesce((SELECT string_agg(t::text, ',' ORDER BY "Id") FROM "Drugs" t
                          WHERE "ClinicId" IS NULL AND "Id" <= @maxDrug), '')
                || '|' || coalesce((SELECT string_agg(t::text, ',' ORDER BY "Id") FROM "Categories" t
                                    WHERE "Id" <= @maxCategory), '')
                || '|' || coalesce((SELECT string_agg(t::text, ',' ORDER BY "Id") FROM "SubCategories" t
                                    WHERE "Id" <= @maxSubCategory), ''))
            """, connection);
        command.Parameters.AddWithValue("maxDrug", maxDrug);
        command.Parameters.AddWithValue("maxCategory", maxCategory);
        command.Parameters.AddWithValue("maxSubCategory", maxSubCategory);
        return (string)await command.ExecuteScalarAsync();
    }
}
