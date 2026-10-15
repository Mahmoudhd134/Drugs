using ClinicHub.IntegrationTests.Harness.Hosting;

namespace ClinicHub.IntegrationTests.Auth;

/// <summary>
/// The Auth tests' parallel group (one database copy, one app). Split into more collections (<c>auth-2</c>…) when the
/// area grows: each collection runs in parallel with the others.
/// </summary>
[CollectionDefinition(Name)]
public sealed class AuthCollection : ICollectionFixture<AppFixture>
{
    public const string Name = "auth";
}
