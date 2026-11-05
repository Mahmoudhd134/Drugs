namespace ClinicHub.IntegrationTests.Attachments.TestHost;

// The attachment tests' parallel groups: each collection has its own database copy, app and attachments folder

/// <summary>Isolation, the super admin, platform files.</summary>
[CollectionDefinition(Name)]
public sealed class AttachmentsCollection : ICollectionFixture<AttachmentsAppFixture>
{
    public const string Name = "attachments";
}

/// <summary>Types, config, size, delete and replace, failures, serving.</summary>
[CollectionDefinition(Name)]
public sealed class AttachmentsCollection2 : ICollectionFixture<AttachmentsAppFixture>
{
    public const string Name = "attachments-2";
}
