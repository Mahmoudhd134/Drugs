using ClinicHub.Application.Common.Abstractions;
using ClinicHub.Application.Common.Messaging;
using ClinicHub.Application.Common.Paging;
using ClinicHub.Application.Common.Results;
using Microsoft.EntityFrameworkCore;

namespace ClinicHub.Application.Features.Platform.Clinics.Queries.GetClinics;

/// <summary>Across clinics: the staff counts read every clinic's staff (<c>IgnoreQueryFilters()</c>, Platform only).</summary>
internal sealed class GetClinicsQueryHandler(IAppDbContext db) : IQueryHandler<GetClinicsQuery, PagedResult<ClinicSummary>>
{
    public async Task<Result<PagedResult<ClinicSummary>>> Handle(GetClinicsQuery query, CancellationToken cancellationToken)
    {
        var (page, pageSize) = Paging.Normalize(query.Page, query.PageSize);
        var clinics = db.Clinics.AsNoTracking().Manageable();

        var term = Paging.SearchTerm(query.Search);
        if (!string.IsNullOrEmpty(term))
            clinics = clinics.Where(c => c.Name.ToLower().Contains(term));

        // Cleaned like a search term (a NUL can't be sent to the database); an unknown value matches nothing
        var status = Paging.SearchTerm(query.Status);
        if (!string.IsNullOrEmpty(status))
            clinics = clinics.Where(c => c.Status == status);

        var totalCount = await clinics.CountAsync(cancellationToken);

        var ordered = string.IsNullOrEmpty(term)
            ? clinics.OrderBy(c => c.Name)
            // Names that start with the search term first
            : clinics.OrderBy(c => c.Name.ToLower().StartsWith(term) ? 0 : 1).ThenBy(c => c.Name);

        var staff = db.Staff.IgnoreQueryFilters();
        var items = await ordered
            .ThenBy(c => c.Id)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .Select(c => new ClinicSummary(c.Id, c.Name, c.Status,
                staff.Count(s => s.ClinicId == c.Id && s.IsActive), c.CreatedAt))
            .ToListAsync(cancellationToken);

        return new PagedResult<ClinicSummary>(items, totalCount, page, pageSize);
    }
}
