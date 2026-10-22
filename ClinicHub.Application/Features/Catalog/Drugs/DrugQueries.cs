using ClinicHub.Application.Common.Abstractions;
using ClinicHub.Domain.Catalog;

namespace ClinicHub.Application.Features.Catalog.Drugs;

/// <summary>The filters of a drug list (design M1.7 D7, D8); values already validated.</summary>
/// <param name="Source">One of <see cref="DrugSource"/> (null or empty = all).</param>
/// <param name="SubCategoryId">A positive int, <see cref="SubCategoryFilter.None"/>, or null/empty.</param>
public record DrugListFilter(string Search, string Source, int? CategoryId, string SubCategoryId);

/// <summary>
/// The one query composition of the clinic drug lists (design M1.7 D7): <c>GetDrugs</c> and (M1.7c) <c>GetDrugTree</c>
/// use it, so a tree bucket's count always equals the drugs it pages.
/// </summary>
public static class DrugQueries
{
    /// <summary>
    /// Visible (the clinic filter) + not withdrawn + source + category filters + search: the folded term contained in
    /// <c>SearchName</c> or (with <c>SearchText.OtherTerm</c>) <c>SearchOther</c>, or the drug's category or subcategory
    /// whose folded English or Arabic name contains it (the ≤ 205 names are folded in memory; their ids join the filter).
    /// M1.7b contract stub (track <c>api</c>).
    /// </summary>
    public static Task<IQueryable<Drug>> ListedAsync(IAppDbContext db, DrugListFilter filter, CancellationToken cancellationToken) =>
        throw new NotImplementedException("M1.7b contract stub: track api");

    /// <summary>
    /// The D7 order: own drugs first, then shared; with a search, names (<c>SearchName</c>) starting with the term first,
    /// then <c>Name</c>, then <c>Id</c>; without one, own drugs newest first (<c>CreatedAt</c>, <c>Id</c> descending), then
    /// shared by <c>Name</c>, then <c>Id</c>. The admin list (shared only) uses the same.
    /// M1.7b contract stub (track <c>api</c>).
    /// </summary>
    public static IOrderedQueryable<Drug> InListOrder(this IQueryable<Drug> drugs, string search) =>
        throw new NotImplementedException("M1.7b contract stub: track api");
}
