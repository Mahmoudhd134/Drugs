using ClinicHub.Application.Common.Abstractions;
using ClinicHub.Application.Common.Messaging;
using ClinicHub.Application.Common.Results;
using Microsoft.EntityFrameworkCore;

namespace ClinicHub.Application.Features.Catalog.Drugs.Queries.GetDrug;

/// <summary>Own or shared (through the clinic filter); a withdrawn shared drug answers 200 with <c>withdrawn: true</c> (D6).</summary>
internal sealed class GetDrugQueryHandler(IAppDbContext db) : IQueryHandler<GetDrugQuery, DrugDto>
{
    public async Task<Result<DrugDto>> Handle(GetDrugQuery query, CancellationToken cancellationToken)
    {
        var drug = await db.Drugs.AsNoTracking().WithCategories().FirstOrDefaultAsync(d => d.Id == query.Id, cancellationToken);
        return drug is null ? DrugErrors.NotFound : drug.ToDto();
    }
}
