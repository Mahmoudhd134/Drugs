using ClinicHub.Application.Common.Abstractions;
using ClinicHub.Application.Common.Messaging;
using ClinicHub.Application.Common.Results;
using Microsoft.EntityFrameworkCore;

namespace ClinicHub.Application.Features.Catalog.Drugs.Queries.GetDrugGroupNames;

internal sealed class GetDrugGroupNamesQueryHandler(IAppDbContext db) : IQueryHandler<GetDrugGroupNamesQuery, List<string>>
{
    public async Task<Result<List<string>>> Handle(GetDrugGroupNamesQuery query, CancellationToken cancellationToken) =>
        await db.DrugGroupItems.AsNoTracking()
            .Where(i => i.DrugId == query.DrugId)
            .Select(i => i.DrugGroup.Name)
            .Distinct()
            .OrderBy(name => name)
            .ToListAsync(cancellationToken);
}
