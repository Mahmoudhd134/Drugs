using ClinicHub.IntegrationTests.Harness.Hosting;

namespace ClinicHub.IntegrationTests.Isolation;

// The Isolation tests' parallel groups: each collection has its own database copy and app, and runs in parallel with the others

[CollectionDefinition(Name)]
public sealed class IsolationCollection : ICollectionFixture<AppFixture>
{
    public const string Name = "isolation";
}

[CollectionDefinition(Name)]
public sealed class IsolationCollection2 : ICollectionFixture<AppFixture>
{
    public const string Name = "isolation-2";
}

[CollectionDefinition(Name)]
public sealed class IsolationCollection3 : ICollectionFixture<AppFixture>
{
    public const string Name = "isolation-3";
}
