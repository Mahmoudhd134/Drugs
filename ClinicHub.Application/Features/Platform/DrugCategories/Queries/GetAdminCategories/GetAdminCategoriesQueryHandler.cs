using ClinicHub.Application.Common.Abstractions;
using ClinicHub.Application.Common.Messaging;
using ClinicHub.Application.Common.Results;
using ClinicHub.Application.Features.Catalog.Categories;
using Microsoft.EntityFrameworkCore;

namespace ClinicHub.Application.Features.Platform.DrugCategories.Queries.GetAdminCategories;

/// <summary>
/// One aggregate over every drug (<c>IgnoreQueryFilters()</c>: shared, withdrawn, every clinic's own, deleted clinics
/// included) per (category, subcategory, deleted clinic), summed in memory onto the ≤ ~205 rows. By id (the SPA sorts).
/// </summary>
internal sealed class GetAdminCategoriesQueryHandler(IAppDbContext db) : IQueryHandler<GetAdminCategoriesQuery, List<AdminCategoryDto>>
{
    public async Task<Result<List<AdminCategoryDto>>> Handle(GetAdminCategoriesQuery request, CancellationToken cancellationToken)
    {
        var categories = await db.Categories.AsNoTracking()
            .Include(c => c.SubCategories)
            .OrderBy(c => c.Id)
            .ToListAsync(cancellationToken);

        var all = await CountsAsync(db.Drugs.IgnoreQueryFilters(), cancellationToken);
        var deletedClinicIds = db.Clinics.Where(c => c.DeletedAt != null).Select(c => (int?)c.Id);
        var deleted = await CountsAsync(db.Drugs.IgnoreQueryFilters().Where(d => deletedClinicIds.Contains(d.ClinicId)),
            cancellationToken);

        int Count(Func<int, int?, bool> where, bool deletedOnly = false) => (deletedOnly ? deleted : all)
            .Where(c => where(c.CategoryId, c.SubCategoryId))
            .Sum(c => c.Count);

        return categories.Select(c => new AdminCategoryDto(
                c.Id, c.NameEn, c.NameAr, CategoryIds.IsPinnedLast(c.Id),
                Count((cat, _) => cat == c.Id),
                Count((cat, _) => cat == c.Id, deletedOnly: true),
                Count((cat, sub) => cat == c.Id && sub == null),
                c.SubCategories.OrderBy(s => s.Id).Select(s => new AdminSubCategoryDto(
                    s.Id, s.NameEn, s.NameAr, SubCategoryIds.IsPinnedLast(s.Id),
                    Count((_, sub) => sub == s.Id),
                    Count((_, sub) => sub == s.Id, deletedOnly: true))).ToList()))
            .ToList();
    }

    private static Task<List<BucketCount>> CountsAsync(IQueryable<Domain.Catalog.Drug> drugs, CancellationToken cancellationToken) =>
        drugs.GroupBy(d => new { d.CategoryId, d.SubCategoryId })
            .Select(g => new BucketCount(g.Key.CategoryId, g.Key.SubCategoryId, g.Count()))
            .ToListAsync(cancellationToken);

    private sealed record BucketCount(int CategoryId, int? SubCategoryId, int Count);
}
