using ClinicHub.Application.Common.Abstractions;
using ClinicHub.Application.Common.Messaging;
using ClinicHub.Application.Common.Results;
using ClinicHub.Domain.Catalog;
using Microsoft.EntityFrameworkCore;

namespace ClinicHub.Application.Features.Catalog.Protocols.Commands.UpdateProtocol;

internal sealed class UpdateProtocolCommandHandler(IAppDbContext db)
    : ICommandHandler<UpdateProtocolCommand, ProtocolDto>
{
    public async Task<Result<ProtocolDto>> Handle(UpdateProtocolCommand command, CancellationToken cancellationToken)
    {
        // Like every validation error, an unknown drug or a duplicate line is reported before an unknown protocol
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
