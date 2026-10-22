using ClinicHub.Application.Common.Abstractions;
using ClinicHub.Application.Common.Messaging;
using ClinicHub.Application.Common.Results;
using Microsoft.EntityFrameworkCore;

namespace ClinicHub.Application.Features.Catalog.Protocols.Commands.DeleteProtocol;

internal sealed class DeleteProtocolCommandHandler(IAppDbContext db) : ICommandHandler<DeleteProtocolCommand>
{
    public async Task<Result> Handle(DeleteProtocolCommand command, CancellationToken cancellationToken)
    {
        var protocol = await db.Protocols.FirstOrDefaultAsync(g => g.Id == command.Id, cancellationToken);
        if (protocol is null)
            return ProtocolErrors.NotFound;

        db.Protocols.Remove(protocol);
        await db.SaveChangesAsync(cancellationToken);
        return Result.Success();
    }
}
