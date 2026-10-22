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
    /// <summary>Reads the baseline of a loaded database. M1.7b contract stub (track <c>harness</c>).</summary>
    public static Task<CatalogBaseline> ReadAsync(string connectionString) =>
        throw new NotImplementedException("M1.7b contract stub: track harness");
}
