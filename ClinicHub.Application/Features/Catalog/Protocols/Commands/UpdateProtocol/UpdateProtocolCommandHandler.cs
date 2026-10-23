using ClinicHub.Application.Common.Abstractions;
using ClinicHub.Application.Common.Messaging;
using ClinicHub.Application.Common.Results;
using ClinicHub.Domain.Catalog;
using Microsoft.EntityFrameworkCore;

namespace ClinicHub.Application.Features.Catalog.Protocols.Commands.UpdateProtocol;

/// <summary>
/// After the validator: <see cref="ProtocolLineRules"/> (a withdrawn drug keeps as many lines as the protocol stores),
/// then 404: like every validation error, they are reported before an unknown protocol.
/// </summary>
internal sealed class UpdateProtocolCommandHandler(IAppDbContext db)
    : ICommandHandler<UpdateProtocolCommand, ProtocolDto>
{
    public async Task<Result<ProtocolDto>> Handle(UpdateProtocolCommand command, CancellationToken cancellationToken)
    {
        var items = SaveProtocolItem.Normalize(command.Items);
        var lineError = await ProtocolLineRules.CheckAsync(db, command.Items, items, command.Id, cancellationToken);
        if (lineError is not null)
            return lineError;

        var protocol = await db.Protocols.Include(g => g.Items).FirstOrDefaultAsync(g => g.Id == command.Id, cancellationToken);
        if (protocol is null)
            return ProtocolErrors.NotFound;

        protocol.Name = command.Name.Trim();
        db.ProtocolItems.RemoveRange(protocol.Items);
        protocol.Items = items.Select((item, index) => new ProtocolItem
        {
            DrugId = item.DrugId,
            Order = index,
            Dosing = item.Dosing,
        }).ToList();
        // Changing only the lines is still a change to the protocol (the interceptor sets the time)
        db.Touch(protocol);
        await db.SaveChangesAsync(cancellationToken);

        return (await db.Protocols.AsNoTracking().WithItems().FirstAsync(g => g.Id == protocol.Id, cancellationToken))
            .ToDto();
    }
}
