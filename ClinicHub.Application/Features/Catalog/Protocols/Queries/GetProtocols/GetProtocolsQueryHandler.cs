using ClinicHub.Application.Common.Abstractions;
using ClinicHub.Application.Common.Messaging;
using ClinicHub.Application.Common.Paging;
using ClinicHub.Application.Common.Results;
using ClinicHub.Application.Common.Search;
using Microsoft.EntityFrameworkCore;

namespace ClinicHub.Application.Features.Catalog.Protocols.Queries.GetProtocols;

internal sealed class GetProtocolsQueryHandler(IAppDbContext db)
    : IQueryHandler<GetProtocolsQuery, PagedResult<ProtocolDto>>
{
    public async Task<Result<PagedResult<ProtocolDto>>> Handle(GetProtocolsQuery query,
        CancellationToken cancellationToken)
    {
        var (page, pageSize) = Paging.Normalize(query.Page, query.PageSize);
        var protocols = db.Protocols.AsNoTracking();

        var term = SearchText.Term(query.Search);
        if (!string.IsNullOrEmpty(term))
            protocols = protocols.Where(g => EF.Property<string>(g, SearchText.Column).Contains(term));

        var totalCount = await protocols.CountAsync(cancellationToken);

        var items = await protocols
            .OrderBy(g => g.Name)
            .ThenBy(g => g.Id)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .WithItems()
            .ToListAsync(cancellationToken);

        return new PagedResult<ProtocolDto>(items.Select(g => g.ToDto()).ToList(), totalCount, page, pageSize);
    }
}
