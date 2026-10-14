using ClinicHub.Application.Common.Abstractions;
using ClinicHub.Application.Common.Messaging;
using ClinicHub.Application.Common.Results;
using Microsoft.EntityFrameworkCore;

namespace ClinicHub.Application.Features.Catalog.Drugs.Queries.GetDrug;

internal sealed class GetDrugQueryHandler(IAppDbContext db) : IQueryHandler<GetDrugQuery, DrugDto>
{
    public async Task<Result<DrugDto>> Handle(GetDrugQuery query, CancellationToken cancellationToken)
    {
        var drug = await db.Drugs.AsNoTracking().FirstOrDefaultAsync(d => d.Id == query.Id, cancellationToken);
        return drug is null ? DrugErrors.NotFound : drug.ToDto();
    }
}
