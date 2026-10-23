using ClinicHub.Application.Common.Abstractions;
using ClinicHub.Application.Common.Search;
using ClinicHub.Domain.Catalog;
using Microsoft.EntityFrameworkCore;

namespace ClinicHub.Application.Features.Catalog.Drugs;

/// <summary>The filters of a drug list (design M1.7 D7, D8); values already validated.</summary>
/// <param name="Source">One of <see cref="DrugSource"/> (null or empty = all).</param>
/// <param name="SubCategoryId">A positive int, <see cref="SubCategoryFilter.None"/>, or null/empty.</param>
public record DrugListFilter(string Search, string Source, int? CategoryId, string SubCategoryId);

/// <summary>Every category and subcategory row, already loaded by the caller.</summary>
internal sealed record CatalogNames(IReadOnlyCollection<Category> Categories, IReadOnlyCollection<SubCategory> SubCategories);

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
    /// A <c>%</c>, <c>_</c> or <c>\</c> in the term is matched literally (EF escapes the LIKE pattern of
    /// <c>Contains</c>). Untracked.
    /// </summary>
    public static Task<IQueryable<Drug>> ListedAsync(IAppDbContext db, DrugListFilter filter, CancellationToken cancellationToken) =>
        FilteredAsync(db, db.Drugs.AsNoTracking().Where(d => !d.IsWithdrawn), filter, cancellationToken);

    /// <summary>
    /// <see cref="ListedAsync(IAppDbContext, DrugListFilter, CancellationToken)"/> with the category and subcategory rows the
    /// caller already loaded (the tree needs them for its names): a search matches their names without loading them again.
    /// </summary>
    internal static Task<IQueryable<Drug>> ListedAsync(IAppDbContext db, DrugListFilter filter, CatalogNames names,
        CancellationToken cancellationToken) =>
        FilteredAsync(db, db.Drugs.AsNoTracking().Where(d => !d.IsWithdrawn), filter, cancellationToken, names);

    /// <summary>
    /// <see cref="ListedAsync"/>'s source, category and search filters on <paramref name="drugs"/> (the admin list starts
    /// from its status filter instead of "not withdrawn").
    /// </summary>
    internal static async Task<IQueryable<Drug>> FilteredAsync(IAppDbContext db, IQueryable<Drug> drugs,
        DrugListFilter filter, CancellationToken cancellationToken, CatalogNames names = null)
    {
        if (filter.Source == DrugSource.Shared)
            drugs = drugs.Where(d => d.ClinicId == null);
        else if (filter.Source == DrugSource.Own)
            drugs = drugs.Where(d => d.ClinicId != null);

        if (filter.CategoryId is { } categoryId)
        {
            drugs = drugs.Where(d => d.CategoryId == categoryId);
            if (filter.SubCategoryId == SubCategoryFilter.None)
                drugs = drugs.Where(d => d.SubCategoryId == null);
            else if (int.TryParse(filter.SubCategoryId, out var subCategoryId))
                drugs = drugs.Where(d => d.SubCategoryId == subCategoryId);
        }

        var term = SearchText.Term(filter.Search);
        if (string.IsNullOrEmpty(term))
            return drugs;

        // A term made only of "+" or "(" folds to blanks for SearchOther, which would match every row (its two parts
        // are joined by a space): that part is then left out
        var otherTerm = SearchText.OtherTerm(filter.Search);
        var matchOther = !string.IsNullOrWhiteSpace(otherTerm);

        // The ≤ ~205 category names (the caller's, else loaded here), folded in memory with the columns' function
        var categoryNames = names?.Categories.Select(c => new NameRow(c.Id, c.NameEn, c.NameAr)).ToList()
                            ?? await db.Categories.AsNoTracking()
                                .Select(c => new NameRow(c.Id, c.NameEn, c.NameAr))
                                .ToListAsync(cancellationToken);
        var subCategoryNames = names?.SubCategories.Select(s => new NameRow(s.Id, s.NameEn, s.NameAr)).ToList()
                               ?? await db.SubCategories.AsNoTracking()
                                   .Select(s => new NameRow(s.Id, s.NameEn, s.NameAr))
                                   .ToListAsync(cancellationToken);
        var categoryIds = categoryNames
            .Where(c => NameMatches(c.NameEn, c.NameAr, term))
            .Select(c => c.Id)
            .ToList();
        var subCategoryIds = subCategoryNames
            .Where(s => NameMatches(s.NameEn, s.NameAr, term))
            .Select(s => (int?)s.Id)
            .ToList();

        return drugs.Where(d => EF.Property<string>(d, SearchText.Column).Contains(term)
                                || (matchOther && EF.Property<string>(d, SearchText.OtherColumn).Contains(otherTerm))
                                || categoryIds.Contains(d.CategoryId)
                                || subCategoryIds.Contains(d.SubCategoryId));
    }

    /// <summary>
    /// The D7 order: own drugs first, then shared; with a search, names (<c>SearchName</c>) starting with the term first,
    /// then <c>Name</c>, then <c>Id</c>; without one, own drugs newest first (<c>CreatedAt</c>, <c>Id</c> descending), then
    /// shared by <c>Name</c>, then <c>Id</c>. The admin list (shared only) uses the same.
    /// </summary>
    public static IOrderedQueryable<Drug> InListOrder(this IQueryable<Drug> drugs, string search)
    {
        // false (own) before true (shared)
        var ownFirst = drugs.OrderBy(d => d.ClinicId == null);
        var term = SearchText.Term(search);
        if (!string.IsNullOrEmpty(term))
            return ownFirst
                .ThenBy(d => EF.Property<string>(d, SearchText.Column).StartsWith(term) ? 0 : 1)
                .ThenBy(d => d.Name)
                .ThenBy(d => d.Id);

        // Shared rows tie on the two own-only keys and fall through to Name, Id
        return ownFirst
            .ThenByDescending(d => d.ClinicId == null ? (DateTime?)null : d.CreatedAt)
            .ThenByDescending(d => d.ClinicId == null ? 0 : d.Id)
            .ThenBy(d => d.Name)
            .ThenBy(d => d.Id);
    }

    private sealed record NameRow(int Id, string NameEn, string NameAr);

    private static bool NameMatches(string nameEn, string nameAr, string term) =>
        SearchText.Fold(nameEn ?? "").Contains(term, StringComparison.Ordinal)
        || SearchText.Fold(nameAr ?? "").Contains(term, StringComparison.Ordinal);
}
