using ClinicHub.IntegrationTests.Harness.Hosting;

namespace ClinicHub.IntegrationTests.Catalog.Journeys;

/// <summary>
/// The api halves of the shared catalog's multi-level cases (M1.7b: their e2e and Vitest halves live in ClinicHub.Web):
/// a database of their own (the loaded catalog; they write test-owned shared drugs and categories only).
/// </summary>
[CollectionDefinition(Name)]
public sealed class CatalogJourneysCollection : ICollectionFixture<AppFixture>
{
    public const string Name = "catalog-journeys";
}
