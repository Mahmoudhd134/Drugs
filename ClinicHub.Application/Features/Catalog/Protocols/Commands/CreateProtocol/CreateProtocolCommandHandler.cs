using ClinicHub.Application.Common.Abstractions;
using ClinicHub.Application.Common.Messaging;
using ClinicHub.Application.Common.Results;
using ClinicHub.Domain.Catalog;
using Microsoft.EntityFrameworkCore;

namespace ClinicHub.Application.Features.Catalog.Protocols.Commands.CreateProtocol;

internal sealed class CreateProtocolCommandHandler(IAppDbContext db)
    : ICommandHandler<CreateProtocolCommand, ProtocolDto>
{
    public async Task<Result<ProtocolDto>> Handle(CreateProtocolCommand command, CancellationToken cancellationToken)
    {
        var items = SaveProtocolItem.Normalize(command.Items);
        var drugIds = items.Select(x => x.DrugId).Distinct().ToList();
        // Each drug's default eye: a line without an eye of its own takes it (the effective eye)
        var defaultEyes = await db.Drugs.AsNoTracking()
            .Where(d => drugIds.Contains(d.Id))
            .Select(d => new { d.Id, d.DefaultDosing.Eye })
            .ToDictionaryAsync(d => d.Id, d => d.Eye, cancellationToken);
        if (defaultEyes.Count != drugIds.Count)
            return ProtocolErrors.DrugNotFound;
        if (SaveProtocolItem.HasDuplicate(items, defaultEyes))
            return ProtocolErrors.DuplicateItem;

        var protocol = new Protocol
        {
            Name = command.Name.Trim(),
            Items = items.Select((item, index) => new ProtocolItem
            {
                DrugId = item.DrugId,
                Order = index,
                Dosing = item.Dosing,
            }).ToList(),
        };
        db.Protocols.Add(protocol);
        await db.SaveChangesAsync(cancellationToken);

        return (await db.Protocols.AsNoTracking().WithItems().FirstAsync(g => g.Id == protocol.Id, cancellationToken))
            .ToDto();
    }
}
