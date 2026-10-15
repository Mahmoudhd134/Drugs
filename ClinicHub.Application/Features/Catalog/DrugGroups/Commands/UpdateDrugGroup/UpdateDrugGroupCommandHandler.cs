using ClinicHub.Application.Common.Abstractions;
using ClinicHub.Application.Common.Messaging;
using ClinicHub.Application.Common.Results;
using ClinicHub.Domain.Catalog;
using Microsoft.EntityFrameworkCore;

namespace ClinicHub.Application.Features.Catalog.DrugGroups.Commands.UpdateDrugGroup;

internal sealed class UpdateDrugGroupCommandHandler(IAppDbContext db)
    : ICommandHandler<UpdateDrugGroupCommand, DrugGroupDto>
{
    public async Task<Result<DrugGroupDto>> Handle(UpdateDrugGroupCommand command, CancellationToken cancellationToken)
    {
        // Like every validation error, an unknown drug or a duplicate line is reported before an unknown group
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

        var group = await db.DrugGroups.Include(g => g.Items).FirstOrDefaultAsync(g => g.Id == command.Id, cancellationToken);
        if (group is null)
            return DrugGroupErrors.NotFound;

        group.Name = command.Name.Trim();
        db.DrugGroupItems.RemoveRange(group.Items);
        group.Items = items.Select((item, index) => new DrugGroupItem
        {
            DrugId = item.DrugId,
            Order = index,
            Dosing = item.Dosing,
        }).ToList();
        // Changing only the lines is still a change to the group (the interceptor sets the time)
        db.Touch(group);
        await db.SaveChangesAsync(cancellationToken);

        return (await db.DrugGroups.AsNoTracking().WithItems().FirstAsync(g => g.Id == group.Id, cancellationToken))
            .ToDto();
    }
}
