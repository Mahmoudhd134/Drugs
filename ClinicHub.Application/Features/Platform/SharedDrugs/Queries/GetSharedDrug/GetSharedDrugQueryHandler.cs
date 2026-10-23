using ClinicHub.Application.Common.Abstractions;
using ClinicHub.Application.Common.Messaging;
using ClinicHub.Application.Common.Results;
using ClinicHub.Application.Features.Catalog.Drugs;
using Microsoft.EntityFrameworkCore;

namespace ClinicHub.Application.Features.Platform.SharedDrugs.Queries.GetSharedDrug;

/// <summary>A platform request: the filter shows only shared drugs, so an own drug's id is 404.</summary>
internal sealed class GetSharedDrugQueryHandler(IAppDbContext db) : IQueryHandler<GetSharedDrugQuery, AdminDrugDto>
{
    public async Task<Result<AdminDrugDto>> Handle(GetSharedDrugQuery request, CancellationToken cancellationToken)
    {
        var drug = await db.Drugs.AsNoTracking().WithCategories()
            .FirstOrDefaultAsync(d => d.Id == request.Id && d.ClinicId == null, cancellationToken);
        return drug is null ? SharedDrugErrors.NotFound : drug.ToAdminDto();
    }
}
