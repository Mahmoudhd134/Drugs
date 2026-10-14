using ClinicHub.Application.Common.Messaging;

namespace ClinicHub.Application.Features.Catalog.DrugGroups.Commands.UpdateDrugGroup;

/// <summary>Replaces the name and every line (order and overrides).</summary>
public record UpdateDrugGroupCommand(int Id, string Name, List<SaveDrugGroupItem> Items)
    : ICommand<DrugGroupDto>;
