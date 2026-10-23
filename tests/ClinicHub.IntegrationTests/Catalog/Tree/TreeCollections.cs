using ClinicHub.IntegrationTests.Harness.Hosting;

namespace ClinicHub.IntegrationTests.Catalog.Tree;

// The drug tree's cases (M1.7c, GET /drugs/tree): three collections, each on its own database copy, so they run in
// parallel with the others; the classes of one collection run one after the other.

/// <summary>The tree on the imported catalog: counts, shape, sources, paging a bucket. No test writes the shared catalog.</summary>
[CollectionDefinition(Name)]
public sealed class CatalogTreeCollection : ICollectionFixture<AppFixture>
{
    public const string Name = "catalog-tree";
}

/// <summary>The tree after shared-catalog writes (test-owned shared drugs, categories and subcategories only).</summary>
[CollectionDefinition(Name)]
public sealed class CatalogTreeEditsCollection : ICollectionFixture<AppFixture>
{
    public const string Name = "catalog-tree-2";
}

/// <summary>The performance measure (CAT-093, CAT-094): its own database, so its 5,000 own drugs reach no other class.</summary>
[CollectionDefinition(Name)]
public sealed class CatalogTreePerformanceCollection : ICollectionFixture<AppFixture>
{
    public const string Name = "catalog-tree-perf";
}
