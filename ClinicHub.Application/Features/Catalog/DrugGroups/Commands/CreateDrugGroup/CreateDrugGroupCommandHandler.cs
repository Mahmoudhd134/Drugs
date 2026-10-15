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
        // Each drug's default eye: a line without an eye of its own takes it (the effective eye)
        var defaultEyes = await db.Drugs.AsNoTracking()
            .Where(d => drugIds.Contains(d.Id))
            .Select(d => new { d.Id, d.DefaultDosing.Eye })
            .ToDictionaryAsync(d => d.Id, d => d.Eye, cancellationToken);
        if (defaultEyes.Count != drugIds.Count)
            return DrugGroupErrors.DrugNotFound;
        if (SaveDrugGroupItem.HasDuplicate(items, defaultEyes))
            return DrugGroupErrors.DuplicateItem;

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
