using ClinicHub.Application.Common.Messaging;

namespace ClinicHub.Application.Features.Catalog.DrugGroups.Commands.DeleteDrugGroup;

/// <summary>Deletes the group and its lines; the drugs stay.</summary>
public record DeleteDrugGroupCommand(int Id) : ICommand;
