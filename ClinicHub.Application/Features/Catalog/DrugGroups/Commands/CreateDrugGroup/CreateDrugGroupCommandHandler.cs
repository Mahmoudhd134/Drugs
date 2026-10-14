using ClinicHub.Application.Common.Abstractions;
using ClinicHub.Application.Common.Messaging;
using ClinicHub.Application.Common.Results;
using ClinicHub.Domain.Catalog;
using Microsoft.EntityFrameworkCore;

namespace ClinicHub.Application.Features.Catalog.DrugGroups.Commands.CreateDrugGroup;

internal sealed class CreateDrugGroupCommandHandler(IAppDbContext db)
    : ICommandHandler<CreateDrugGroupCommand, DrugGroupDto>
{
    public async Task<Result<DrugGroupDto>> Handle(CreateDrugGroupCommand command, CancellationToken cancellationToken)
    {
        var items = SaveDrugGroupItem.Normalize(command.Items);
        var drugIds = items.Select(x => x.DrugId).Distinct().ToList();
        if (await db.Drugs.CountAsync(d => drugIds.Contains(d.Id), cancellationToken) != drugIds.Count)
            return DrugGroupErrors.DrugNotFound;

        var group = new DrugGroup
        {
            Name = command.Name.Trim(),
            Items = items.Select((item, index) => new DrugGroupItem
            {
                DrugId = item.DrugId,
                Order = index,
                Dosing = item.Dosing,
            }).ToList(),
        };
        db.DrugGroups.Add(group);
        await db.SaveChangesAsync(cancellationToken);

        return (await db.DrugGroups.AsNoTracking().WithItems().FirstAsync(g => g.Id == group.Id, cancellationToken))
            .ToDto();
    }
}
