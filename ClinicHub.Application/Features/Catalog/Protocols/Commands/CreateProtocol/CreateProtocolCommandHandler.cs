using ClinicHub.Application.Common.Abstractions;
using ClinicHub.Application.Common.Messaging;
using ClinicHub.Application.Common.Results;
using ClinicHub.Domain.Catalog;
using Microsoft.EntityFrameworkCore;

namespace ClinicHub.Application.Features.Catalog.Protocols.Commands.CreateProtocol;

/// <summary>After the validator: <see cref="ProtocolLineRules"/> (a new protocol has no stored line, so any withdrawn drug is refused).</summary>
internal sealed class CreateProtocolCommandHandler(IAppDbContext db)
    : ICommandHandler<CreateProtocolCommand, ProtocolDto>
{
    public async Task<Result<ProtocolDto>> Handle(CreateProtocolCommand command, CancellationToken cancellationToken)
    {
        var items = SaveProtocolItem.Normalize(command.Items);
        var lineError = await ProtocolLineRules.CheckAsync(db, command.Items, items, protocolId: null, cancellationToken);
        if (lineError is not null)
            return lineError;

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
