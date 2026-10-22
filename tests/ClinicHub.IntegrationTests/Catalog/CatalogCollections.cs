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

/// <summary>
/// The search-name migration (DRUG-101): it migrates its database down and up again, so it has a database of its own.
/// </summary>
[CollectionDefinition(Name)]
public sealed class CatalogMigrationCollection : ICollectionFixture<AppFixture>
{
    public const string Name = "catalog-migrations";
}
