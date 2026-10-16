using ClinicHub.IntegrationTests.Harness.Hosting;

namespace ClinicHub.IntegrationTests.Access;

// The Access tests' parallel groups: each collection has its own database copy and app, and runs in parallel with the others

[CollectionDefinition(Name)]
public sealed class AccessCollection : ICollectionFixture<AppFixture>
{
    public const string Name = "access";
}

[CollectionDefinition(Name)]
public sealed class AccessCollection2 : ICollectionFixture<AppFixture>
{
    public const string Name = "access-2";
}

[CollectionDefinition(Name)]
public sealed class AccessCollection3 : ICollectionFixture<AppFixture>
{
    public const string Name = "access-3";
}

[CollectionDefinition(Name)]
public sealed class AccessCollection4 : ICollectionFixture<AppFixture>
{
    public const string Name = "access-4";
}
