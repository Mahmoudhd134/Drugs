using ClinicHub.IntegrationTests.Harness.Hosting;

namespace ClinicHub.IntegrationTests.Admin.SharedDrugs;

// The shared catalog's admin and withdrawn-drug cases (M1.7b): three collections, each on its own database copy, so they
// run in parallel with the others; the classes of one collection run one after the other.

[CollectionDefinition(Name)]
public sealed class SharedDrugsCollection : ICollectionFixture<AppFixture>
{
    public const string Name = "shared-drugs";
}

[CollectionDefinition(Name)]
public sealed class DrugCategoriesCollection : ICollectionFixture<AppFixture>
{
    public const string Name = "drug-categories";
}

[CollectionDefinition(Name)]
public sealed class WithdrawnDrugsCollection : ICollectionFixture<AppFixture>
{
    public const string Name = "withdrawn-drugs";
}
