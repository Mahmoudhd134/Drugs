namespace ClinicHub.IntegrationTests.Harness.Hosting;

/// <summary>
/// The migration collection's fixture (design M1.7 D12): its database is a copy of the bare template (migrated and
/// seeded, no catalog: <c>AddSharedCatalog</c> needs an empty <c>Drugs</c> table to be crossed), reset without the
/// baseline and checksum checks. Its test classes take <c>BareAppFixture app</c> (xUnit injects a fixture by its exact
/// type).
/// </summary>
public sealed class BareAppFixture : AppFixture
{
    protected override bool UsesBareTemplate => true;
}
