namespace ClinicHub.Application.Features.Platform.Provisioning;

/// <summary>
/// One provisioning step (registered as <see cref="IClinicSeeder"/>, scoped). Runs inside the new clinic (it is
/// the current clinic) and inside the provisioning transaction. A new module adds its own seeder.
/// </summary>
internal interface IClinicSeeder
{
    /// <summary>Seeders run in ascending order (10 roles, 20 owner, 30 catalog; leave gaps).</summary>
    int Order { get; }

    Task SeedAsync(ClinicSeedContext context, CancellationToken cancellationToken);
}

/// <summary>What the seeders know about the clinic being created (owner phone in E.164, names trimmed).</summary>
internal sealed record ClinicSeedContext(int ClinicId, string OwnerPhone, string OwnerName);
