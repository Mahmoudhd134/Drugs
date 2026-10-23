using ClinicHub.Application.Common.Abstractions;
using ClinicHub.Application.Common.Messaging;
using ClinicHub.Application.Common.Results;
using Microsoft.EntityFrameworkCore;

namespace ClinicHub.Application.Features.Catalog.Categories.Queries.GetCategories;

/// <summary>By id (the SPA sorts by name in the UI language); <c>pinnedLast</c> by the fixed ids.</summary>
internal sealed class GetCategoriesQueryHandler(IAppDbContext db) : IQueryHandler<GetCategoriesQuery, List<CategoryDto>>
{
    public async Task<Result<List<CategoryDto>>> Handle(GetCategoriesQuery query, CancellationToken cancellationToken)
    {
        var categories = await db.Categories.AsNoTracking()
            .Include(c => c.SubCategories)
            .OrderBy(c => c.Id)
            .ToListAsync(cancellationToken);
        return categories.Select(c => c.ToDto()).ToList();
    }
}
