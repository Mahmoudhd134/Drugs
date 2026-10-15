using ClinicHub.Application.Common.Abstractions;
using ClinicHub.Application.Common.Messaging;
using ClinicHub.Application.Common.Paging;
using ClinicHub.Application.Common.Results;
using ClinicHub.Application.Common.Search;
using Microsoft.EntityFrameworkCore;

namespace ClinicHub.Application.Features.Catalog.Drugs.Queries.GetDrugs;

internal sealed class GetDrugsQueryHandler(IAppDbContext db) : IQueryHandler<GetDrugsQuery, PagedResult<DrugDto>>
{
    public async Task<Result<PagedResult<DrugDto>>> Handle(GetDrugsQuery query, CancellationToken cancellationToken)
    {
        var (page, pageSize) = Paging.Normalize(query.Page, query.PageSize);
        var drugs = db.Drugs.AsNoTracking();

        var term = SearchText.Term(query.Search);
        if (!string.IsNullOrEmpty(term))
            drugs = drugs.Where(d => EF.Property<string>(d, SearchText.Column).Contains(term));

        var totalCount = await drugs.CountAsync(cancellationToken);

        var ordered = string.IsNullOrEmpty(term)
            ? drugs.OrderBy(d => d.Name)
            // Names that start with the search term first (both folded)
            : drugs.OrderBy(d => EF.Property<string>(d, SearchText.Column).StartsWith(term) ? 0 : 1).ThenBy(d => d.Name);

        var items = await ordered
            .ThenBy(d => d.Id)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .ToListAsync(cancellationToken);

        return new PagedResult<DrugDto>(items.Select(d => d.ToDto()).ToList(), totalCount, page, pageSize);
    }
}
