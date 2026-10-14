using ClinicHub.Application.Common.Messaging;

namespace ClinicHub.Application.Features.Platform.Clinics.Commands.SuspendClinic;

/// <summary>
/// Suspends a managed clinic: nobody can enter it, its data is kept. Idempotent. Takes effect on the
/// next request: the clinic's access cache entries are cleared after the commit.
/// </summary>
public record SuspendClinicCommand(int Id) : ICommand;
