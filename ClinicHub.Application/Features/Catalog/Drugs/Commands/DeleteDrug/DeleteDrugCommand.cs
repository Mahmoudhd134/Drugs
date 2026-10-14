using ClinicHub.Application.Common.Messaging;

namespace ClinicHub.Application.Features.Catalog.Drugs.Commands.DeleteDrug;

/// <summary>Deletes the drug and, by cascade, its lines in every group.</summary>
public record DeleteDrugCommand(int Id) : ICommand;
