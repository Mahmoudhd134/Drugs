using ClinicHub.Application.Common.Abstractions;
using ClinicHub.Application.Common.Messaging;
using ClinicHub.Application.Common.Results;
using Microsoft.EntityFrameworkCore;

namespace ClinicHub.Application.Features.Catalog.Drugs.Queries.GetDrugProtocolNames;

internal sealed class GetDrugProtocolNamesQueryHandler(IAppDbContext db) : IQueryHandler<GetDrugProtocolNamesQuery, List<string>>
{
    public async Task<Result<List<string>>> Handle(GetDrugProtocolNamesQuery query, CancellationToken cancellationToken) =>
        await db.ProtocolItems.AsNoTracking()
            .Where(i => i.DrugId == query.DrugId)
            .Select(i => i.Protocol.Name)
            .Distinct()
            .OrderBy(name => name)
            .ToListAsync(cancellationToken);
}
