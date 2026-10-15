using ClinicHub.IntegrationTests.Harness.Hosting;

namespace ClinicHub.IntegrationTests.SelfTests;

// Two collections: they run in parallel, each on its own database copy

[CollectionDefinition(Name)]
public sealed class InfraCollectionA : ICollectionFixture<AppFixture>
{
    public const string Name = "infra-a";
}

[CollectionDefinition(Name)]
public sealed class InfraCollectionB : ICollectionFixture<AppFixture>
{
    public const string Name = "infra-b";
}
