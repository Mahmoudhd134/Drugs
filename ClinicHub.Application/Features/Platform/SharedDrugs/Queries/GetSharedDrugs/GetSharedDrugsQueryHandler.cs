using ClinicHub.Application.Common.Abstractions;
using ClinicHub.Application.Common.Messaging;
using ClinicHub.Application.Common.Paging;
using ClinicHub.Application.Common.Results;
using ClinicHub.Application.Features.Catalog.Drugs;
using Microsoft.EntityFrameworkCore;

namespace ClinicHub.Application.Features.Platform.SharedDrugs.Queries.GetSharedDrugs;

/// <summary>The status filter (default active), then the clinic list's category filters, search and order (D7).</summary>
internal sealed class GetSharedDrugsQueryHandler(IAppDbContext db)
    : IQueryHandler<GetSharedDrugsQuery, PagedResult<AdminDrugDto>>
{
    public async Task<Result<PagedResult<AdminDrugDto>>> Handle(GetSharedDrugsQuery request, CancellationToken cancellationToken)
    {
        var (page, pageSize) = Paging.Normalize(request.Page, request.PageSize);
        // Shared only (the platform filter already says so)
        var drugs = db.Drugs.AsNoTracking().Where(d => d.ClinicId == null);
        drugs = request.Status switch
        {
            SharedDrugStatus.Withdrawn => drugs.Where(d => d.IsWithdrawn),
            SharedDrugStatus.All => drugs,
            _ => drugs.Where(d => !d.IsWithdrawn),
        };
        drugs = await DrugQueries.FilteredAsync(db, drugs,
            new DrugListFilter(request.Search, DrugSource.All, request.CategoryId, request.SubCategoryId), cancellationToken);

        var totalCount = await drugs.CountAsync(cancellationToken);
        var items = await drugs
            .WithCategories()
            .InListOrder(request.Search)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .ToListAsync(cancellationToken);

        return new PagedResult<AdminDrugDto>(items.Select(d => d.ToAdminDto()).ToList(), totalCount, page, pageSize);
    }
}
