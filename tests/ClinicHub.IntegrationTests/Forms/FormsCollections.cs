using ClinicHub.IntegrationTests.Harness.Hosting;

namespace ClinicHub.IntegrationTests.Forms;

// The forms tests' parallel groups: each collection has its own database copy and app

/// <summary>The real app: list, read, create, shell, delete, access, database, and the real <c>IFormUsage</c> registration.</summary>
[CollectionDefinition(Name)]
public sealed class FormsCollection : ICollectionFixture<AppFixture>
{
    public const string Name = "forms";
}

/// <summary>Save and versioning: the app with <see cref="FormUsageSwitch"/> in place of <c>IFormUsage</c>.</summary>
[CollectionDefinition(Name)]
public sealed class FormsSavingCollection : ICollectionFixture<FormsAppFixture>
{
    public const string Name = "forms-saving";
}
