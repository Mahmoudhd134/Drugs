using ClinicHub.Application.Common.Messaging;

namespace ClinicHub.Application.Features.Catalog.DrugGroups.Commands.CreateDrugGroup;

public record CreateDrugGroupCommand(string Name, List<SaveDrugGroupItem> Items)
    : ICommand<DrugGroupDto>;
