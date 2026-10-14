using ClinicHub.Application.Features.Platform.Clinics;

namespace ClinicHub.Application.Features.Platform.Provisioning;

/// <summary>
/// Creates a clinic ready to use (HLD 7.3, design D5). Internal: only the <c>CreateClinicCommand</c> handler
/// calls it, so it always runs inside that command's transaction (any failure rolls everything back); it never
/// opens or checks transactions itself.
/// </summary>
internal interface IClinicProvisioner
{
    /// <summary>
    /// Inserts the clinic (<c>active</c>), then, inside it (<c>IClinicScope.Use</c>), runs every
    /// <see cref="IClinicSeeder"/> by <see cref="IClinicSeeder.Order"/>, and returns the new clinic.
    /// <paramref name="name"/> and <paramref name="ownerName"/> come trimmed, <paramref name="ownerPhone"/>
    /// normalized (E.164), from the caller.
    /// </summary>
    Task<ClinicDetails> ProvisionAsync(string name, string ownerPhone, string ownerName, CancellationToken cancellationToken);
}
