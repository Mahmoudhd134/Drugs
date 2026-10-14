using ClinicHub.Application.Common.Abstractions;
using ClinicHub.Application.Common.Messaging;
using ClinicHub.Application.Common.Paging;
using ClinicHub.Application.Common.Results;
using Microsoft.EntityFrameworkCore;

namespace ClinicHub.Application.Features.Catalog.DrugGroups.Queries.GetDrugGroups;

internal sealed class GetDrugGroupsQueryHandler(IAppDbContext db)
    : IQueryHandler<GetDrugGroupsQuery, PagedResult<DrugGroupDto>>
{
    public async Task<Result<PagedResult<DrugGroupDto>>> Handle(GetDrugGroupsQuery query,
        CancellationToken cancellationToken)
    {
        var (page, pageSize) = Paging.Normalize(query.Page, query.PageSize);
        var groups = db.DrugGroups.AsNoTracking();

        var term = Paging.SearchTerm(query.Search);
        if (!string.IsNullOrEmpty(term))
            groups = groups.Where(g => g.Name.ToLower().Contains(term));

        var totalCount = await groups.CountAsync(cancellationToken);

        var items = await groups
            .OrderBy(g => g.Name)
            .ThenBy(g => g.Id)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .WithItems()
            .ToListAsync(cancellationToken);

        return new PagedResult<DrugGroupDto>(items.Select(g => g.ToDto()).ToList(), totalCount, page, pageSize);
    }
}
