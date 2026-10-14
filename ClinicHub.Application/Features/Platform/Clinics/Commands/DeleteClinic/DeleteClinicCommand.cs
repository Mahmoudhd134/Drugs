using ClinicHub.Application.Common.Messaging;

namespace ClinicHub.Application.Features.Platform.Clinics.Commands.DeleteClinic;

/// <summary>
/// Soft deletes a managed clinic (<c>DeletedAt</c>; <c>Status</c> untouched, all rows kept): hidden everywhere,
/// nobody can enter it, from the next request on. Final for now (no restore); deleting it again → not found.
/// </summary>
public record DeleteClinicCommand(int Id) : ICommand;
