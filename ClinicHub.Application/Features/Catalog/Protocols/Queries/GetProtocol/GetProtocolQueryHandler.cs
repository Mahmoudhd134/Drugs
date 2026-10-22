using ClinicHub.Application.Common.Abstractions;
using ClinicHub.Application.Common.Messaging;
using ClinicHub.Application.Common.Results;
using Microsoft.EntityFrameworkCore;

namespace ClinicHub.Application.Features.Catalog.Protocols.Queries.GetProtocol;

internal sealed class GetProtocolQueryHandler(IAppDbContext db) : IQueryHandler<GetProtocolQuery, ProtocolDto>
{
    public async Task<Result<ProtocolDto>> Handle(GetProtocolQuery query, CancellationToken cancellationToken)
    {
        var protocol = await db.Protocols.AsNoTracking().WithItems().FirstOrDefaultAsync(g => g.Id == query.Id, cancellationToken);
        return protocol is null ? ProtocolErrors.NotFound : protocol.ToDto();
    }
}
