using ClinicHub.IntegrationTests.Harness.Hosting;

namespace ClinicHub.IntegrationTests.Catalog;

/// <summary>Drugs: details, create, update, delete, validation.</summary>
[CollectionDefinition(Name)]
public sealed class CatalogCollection : ICollectionFixture<AppFixture>
{
    public const string Name = "catalog";
}

/// <summary>Drugs: list, paging, ordering, search.</summary>
[CollectionDefinition(Name)]
public sealed class CatalogListCollection : ICollectionFixture<AppFixture>
{
    public const string Name = "catalog-2";
}

/// <summary>Protocols.</summary>
[CollectionDefinition(Name)]
public sealed class CatalogProtocolsCollection : ICollectionFixture<AppFixture>
{
    public const string Name = "catalog-3";
}

/// <summary>Dosing and tapering through the drug and protocol APIs.</summary>
[CollectionDefinition(Name)]
public sealed class CatalogDosingCollection : ICollectionFixture<AppFixture>
{
    public const string Name = "catalog-4";
}

/// <summary>The shared catalog seen by clinics (design M1.7): source, order, paging and filters on the imported catalog.</summary>
[CollectionDefinition(Name)]
public sealed class CatalogSharedCollection : ICollectionFixture<AppFixture>
{
    public const string Name = "catalog-5";
}

/// <summary>Searching the shared catalog (names, ingredients, the hidden Arabic name, categories).</summary>
[CollectionDefinition(Name)]
public sealed class CatalogSearchCollection : ICollectionFixture<AppFixture>
{
    public const string Name = "catalog-6";
}

/// <summary>Shared drugs read-only for clinics, the save guards, the app-filled search columns.</summary>
[CollectionDefinition(Name)]
public sealed class CatalogGuardsCollection : ICollectionFixture<AppFixture>
{
    public const string Name = "catalog-7";
}

/// <summary>
/// The migration tests (DRUG-101, RenameGroupsToProtocols: CAT-003, CAT-004, ACC-085, ACC-088; AddSharedCatalog:
/// CAT-005–007): they migrate their database down and up again, so they have a database of their own, a copy of the
/// bare template (migrated and seeded, no catalog: design M1.7 D12). <c>AddSharedCatalog</c> is crossed upwards only
/// with an empty <c>Drugs</c> table (§ 5), and the builders' default category doesn't exist there: drugs go in a test
/// category (<see cref="Migrations.MigrationData"/>).
/// </summary>
[CollectionDefinition(Name)]
public sealed class CatalogMigrationCollection : ICollectionFixture<BareAppFixture>
{
    public const string Name = "catalog-migrations";
}
