using ClinicHub.Application.Common.Abstractions;
using ClinicHub.Application.Common.Messaging;
using ClinicHub.Application.Common.Paging;
using ClinicHub.Application.Common.Results;
using Microsoft.EntityFrameworkCore;

namespace ClinicHub.Application.Features.Catalog.Drugs.Queries.GetDrugs;

internal sealed class GetDrugsQueryHandler(IAppDbContext db) : IQueryHandler<GetDrugsQuery, PagedResult<DrugDto>>
{
    public async Task<Result<PagedResult<DrugDto>>> Handle(GetDrugsQuery query, CancellationToken cancellationToken)
    {
        var (page, pageSize) = Paging.Normalize(query.Page, query.PageSize);
        var drugs = await DrugQueries.ListedAsync(db,
            new DrugListFilter(query.Search, query.Source, query.CategoryId, query.SubCategoryId), cancellationToken);

        var totalCount = await drugs.CountAsync(cancellationToken);
        var items = await drugs
            .WithCategories()
            .InListOrder(query.Search)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .ToListAsync(cancellationToken);

        return new PagedResult<DrugDto>(items.Select(d => d.ToDto()).ToList(), totalCount, page, pageSize);
    }
}
