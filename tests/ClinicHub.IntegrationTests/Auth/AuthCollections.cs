using ClinicHub.IntegrationTests.Harness.Hosting;

namespace ClinicHub.IntegrationTests.Auth;

// More parallel groups for the Auth area (AuthCollection is "auth"): each has its own database copy and app.

/// <summary>Requesting a code (limits, phones).</summary>
[CollectionDefinition(Name)]
public sealed class AuthCollection2 : ICollectionFixture<AppFixture>
{
    public const string Name = "auth-2";
}

/// <summary>Verifying a code (attempts, expiry, tokens, cookie).</summary>
[CollectionDefinition(Name)]
public sealed class AuthCollection3 : ICollectionFixture<AppFixture>
{
    public const string Name = "auth-3";
}

/// <summary>Login refusals and access token validation.</summary>
[CollectionDefinition(Name)]
public sealed class AuthCollection4 : ICollectionFixture<AppFixture>
{
    public const string Name = "auth-4";
}

/// <summary>Refresh: lifetimes, rotation, lost contexts.</summary>
[CollectionDefinition(Name)]
public sealed class AuthCollection5 : ICollectionFixture<AppFixture>
{
    public const string Name = "auth-5";
}

/// <summary>Contexts, switching, logout.</summary>
[CollectionDefinition(Name)]
public sealed class AuthCollection6 : ICollectionFixture<AppFixture>
{
    public const string Name = "auth-6";
}
