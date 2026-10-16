using ClinicHub.IntegrationTests.Harness.Hosting;

namespace ClinicHub.IntegrationTests.Admin;

// The admin tests' parallel groups: each collection has its own database copy and app and runs in parallel with the
// others; the classes of one collection run one after the other.

/// <summary>Authorization, the demoted super admin (restart cases), template protections.</summary>
[CollectionDefinition(Name)]
public sealed class AdminCollection : ICollectionFixture<AppFixture>
{
    public const string Name = "admin";
}

/// <summary>Clinics list, search and paging.</summary>
[CollectionDefinition(Name)]
public sealed class AdminCollection2 : ICollectionFixture<AppFixture>
{
    public const string Name = "admin-2";
}

/// <summary>Create clinic: validation and provisioning.</summary>
[CollectionDefinition(Name)]
public sealed class AdminCollection3 : ICollectionFixture<AppFixture>
{
    public const string Name = "admin-3";
}

/// <summary>Clinic details, rename, suspend / activate, soft delete.</summary>
[CollectionDefinition(Name)]
public sealed class AdminCollection4 : ICollectionFixture<AppFixture>
{
    public const string Name = "admin-4";
}

/// <summary>Roles and the Owner label.</summary>
[CollectionDefinition(Name)]
public sealed class AdminCollection5 : ICollectionFixture<AppFixture>
{
    public const string Name = "admin-5";
}

/// <summary>Staff, the last active owner, lockout after an admin change.</summary>
[CollectionDefinition(Name)]
public sealed class AdminCollection6 : ICollectionFixture<AppFixture>
{
    public const string Name = "admin-6";
}
