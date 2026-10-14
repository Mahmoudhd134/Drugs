using ClinicHub.Application.Common.Abstractions;
using ClinicHub.Application.Common.Messaging;
using ClinicHub.Application.Common.Results;
using Microsoft.EntityFrameworkCore;

namespace ClinicHub.Application.Features.Catalog.DrugGroups.Queries.GetDrugGroup;

internal sealed class GetDrugGroupQueryHandler(IAppDbContext db) : IQueryHandler<GetDrugGroupQuery, DrugGroupDto>
{
    public async Task<Result<DrugGroupDto>> Handle(GetDrugGroupQuery query, CancellationToken cancellationToken)
    {
        var group = await db.DrugGroups.AsNoTracking().WithItems().FirstOrDefaultAsync(g => g.Id == query.Id, cancellationToken);
        return group is null ? DrugGroupErrors.NotFound : group.ToDto();
    }
}
