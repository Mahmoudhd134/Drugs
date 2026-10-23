using ClinicHub.Application.Common.Messaging;

namespace ClinicHub.Application.Features.Platform.SharedDrugs.Commands.RestoreSharedDrug;

/// <summary>Idempotent (also on an active drug); 404 for an own or unknown id (design M1.7 D6).</summary>
public record RestoreSharedDrugCommand(int Id) : ICommand;
