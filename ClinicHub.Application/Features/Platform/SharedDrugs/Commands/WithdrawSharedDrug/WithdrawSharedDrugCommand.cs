using ClinicHub.Application.Common.Messaging;

namespace ClinicHub.Application.Features.Platform.SharedDrugs.Commands.WithdrawSharedDrug;

/// <summary>Idempotent (a second withdraw keeps the first time); 404 for an own or unknown id (design M1.7 D6).</summary>
public record WithdrawSharedDrugCommand(int Id) : ICommand;
