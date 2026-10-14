using ClinicHub.Application.Common.Messaging;
using ClinicHub.Domain.Catalog;

namespace ClinicHub.Application.Features.Catalog.Drugs.Commands.CreateDrug;

public record CreateDrugCommand(string Name, string Description, Dosing DefaultDosing)
    : ICommand<DrugDto>;
