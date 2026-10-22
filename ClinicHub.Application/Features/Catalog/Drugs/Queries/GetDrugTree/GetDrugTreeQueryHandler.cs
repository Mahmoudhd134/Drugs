using ClinicHub.Application.Common.Abstractions;
using ClinicHub.Application.Common.Messaging;
using ClinicHub.Application.Common.Results;
using ClinicHub.Application.Features.Catalog.Categories;
using ClinicHub.Domain.Catalog;
using Microsoft.EntityFrameworkCore;

namespace ClinicHub.Application.Features.Catalog.Drugs.Queries.GetDrugTree;

/// <summary>
/// One aggregate query over <see cref="DrugQueries.ListedAsync"/> (search + source, no category filter): counts per
/// <c>(CategoryId, SubCategoryId)</c>, joined in memory with the ≤ ~205 category and subcategory rows
/// (<c>CategoryIds.IsPinnedLast</c>, <c>SubCategoryIds.IsPinnedLast</c>). Going through <c>ListedAsync</c> keeps the
/// invariant with <c>GET /drugs</c>: a bucket's count is that list's <c>totalCount</c> for the same search and source.
/// </summary>
internal sealed class GetDrugTreeQueryHandler(IAppDbContext db) : IQueryHandler<GetDrugTreeQuery, DrugTreeDto>
{
    public async Task<Result<DrugTreeDto>> Handle(GetDrugTreeQuery query, CancellationToken cancellationToken)
    {
        var drugs = await DrugQueries.ListedAsync(db, new DrugListFilter(query.Search, query.Source, null, null),
            cancellationToken);

        var counts = await drugs
            .GroupBy(d => new { d.CategoryId, d.SubCategoryId })
            .Select(g => new { g.Key.CategoryId, g.Key.SubCategoryId, Count = g.Count() })
            .ToListAsync(cancellationToken);
        if (counts.Count == 0)
            return new DrugTreeDto([]);

        var categories = await db.Categories.AsNoTracking().ToDictionaryAsync(c => c.Id, cancellationToken);
        var subCategories = await db.SubCategories.AsNoTracking().ToDictionaryAsync(s => s.Id, cancellationToken);

        var tree = counts
            .Where(c => c.Count > 0)
            .GroupBy(c => c.CategoryId)
            .OrderBy(g => g.Key)
            .Select(g =>
            {
                var category = categories[g.Key];
                var rows = g
                    .OrderBy(c => c.SubCategoryId is null)
                    .ThenBy(c => c.SubCategoryId)
                    .Select(c => SubCategoryRow(c.SubCategoryId, c.Count, subCategories))
                    .ToList();
                return new DrugTreeCategoryDto(category.Id, category.NameEn, category.NameAr,
                    CategoryIds.IsPinnedLast(category.Id), rows.Sum(r => r.Count), rows);
            })
            .ToList();

        return new DrugTreeDto(tree);
    }

    /// <summary>A subcategory's row, or (id null) the category's bucket: null names, never pinned last.</summary>
    private static DrugTreeSubCategoryDto SubCategoryRow(int? subCategoryId, int count,
        Dictionary<int, SubCategory> subCategories)
    {
        if (subCategoryId is not { } id)
            return new DrugTreeSubCategoryDto(null, null, null, false, count);
        var subCategory = subCategories[id];
        return new DrugTreeSubCategoryDto(id, subCategory.NameEn, subCategory.NameAr, SubCategoryIds.IsPinnedLast(id),
            count);
    }
}
