using ClinicHub.Application.Common.Messaging;

namespace ClinicHub.Application.Features.Platform.Clinics.Commands.ActivateClinic;

/// <summary>
/// Re-activates a suspended managed clinic. Idempotent. Takes effect on the next request: the clinic's
/// access cache entries are cleared after the commit.
/// </summary>
public record ActivateClinicCommand(int Id) : ICommand;
