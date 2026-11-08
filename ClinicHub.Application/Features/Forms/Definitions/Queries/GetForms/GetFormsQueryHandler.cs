using ClinicHub.Application.Common.Abstractions;
using ClinicHub.Application.Common.Messaging;
using ClinicHub.Application.Common.Paging;
using ClinicHub.Application.Common.Results;
using ClinicHub.Application.Common.Search;
using Microsoft.EntityFrameworkCore;

namespace ClinicHub.Application.Features.Forms.Definitions.Queries.GetForms;

internal sealed class GetFormsQueryHandler(IAppDbContext db) : IQueryHandler<GetFormsQuery, PagedResult<FormSummary>>
{
    public async Task<Result<PagedResult<FormSummary>>> Handle(GetFormsQuery query, CancellationToken cancellationToken)
    {
        var (page, pageSize) = Paging.Normalize(query.Page, query.PageSize);
        var forms = db.Forms.AsNoTracking().NotDeleted();

        var term = SearchText.Term(query.Search);
        if (!string.IsNullOrEmpty(term))
            forms = forms.Where(f => EF.Property<string>(f, SearchText.Column).Contains(term));

        var totalCount = await forms.CountAsync(cancellationToken);

        var ordered = string.IsNullOrEmpty(term)
            ? forms.OrderBy(f => f.Name)
            // Names that start with the search term first (both folded)
            : forms.OrderBy(f => EF.Property<string>(f, SearchText.Column).StartsWith(term) ? 0 : 1).ThenBy(f => f.Name);

        var items = await ordered
            .ThenBy(f => f.Id)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .Select(f => new FormSummary(f.Id, f.Name, f.ActiveVersionNumber, f.UpdatedAt))
            .ToListAsync(cancellationToken);

        return new PagedResult<FormSummary>(items, totalCount, page, pageSize);
    }
}
