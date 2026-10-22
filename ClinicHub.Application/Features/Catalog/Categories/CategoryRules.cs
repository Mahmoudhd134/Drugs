using ClinicHub.Application.Common.Abstractions;
using ClinicHub.Application.Common.Results;
using ClinicHub.Application.Common.Search;
using Microsoft.EntityFrameworkCore;

namespace ClinicHub.Application.Features.Catalog.Categories;

/// <summary>The category rules shared by the clinic and admin drug use cases and the admin category use cases.</summary>
internal static class CategoryRules
{
    /// <summary>
    /// A drug's category and subcategory (design M1.7 D3, § 7 order): <see cref="CategoryErrors.CategoryNotFound"/>, then
    /// <see cref="CategoryErrors.SubCategoryNotFound"/> (unknown, or of another category); null when both are fine.
    /// <paramref name="categoryId"/> is non-null (the validator's <c>categoryRequired</c> ran first).
    /// </summary>
    public static async Task<Error> CheckDrugCategoryAsync(IAppDbContext db, int categoryId, int? subCategoryId,
        CancellationToken cancellationToken)
    {
        if (!await db.Categories.AnyAsync(c => c.Id == categoryId, cancellationToken))
            return CategoryErrors.CategoryNotFound;
        if (subCategoryId is { } id
            && !await db.SubCategories.AnyAsync(s => s.Id == id && s.CategoryId == categoryId, cancellationToken))
            return CategoryErrors.SubCategoryNotFound;
        return null;
    }

    /// <summary>
    /// Name uniqueness per language (D5): trimmed and <see cref="SearchText.Fold"/>ed (case, hamza and alef forms ignored),
    /// among <paramref name="siblings"/> (the row itself left out by the caller). <paramref name="taken"/> with its field
    /// (<c>NameEn</c> first, then <c>NameAr</c>), or null.
    /// </summary>
    public static Error NameTaken(IEnumerable<(string NameEn, string NameAr)> siblings, string nameEn, string nameAr, Error taken)
    {
        var list = siblings.ToList();
        if (list.Any(s => SameName(s.NameEn, nameEn)))
            return taken with { Field = "NameEn" };
        if (list.Any(s => SameName(s.NameAr, nameAr)))
            return taken with { Field = "NameAr" };
        return null;
    }

    private static bool SameName(string a, string b) =>
        string.Equals(SearchText.Fold((a ?? "").Trim()), SearchText.Fold((b ?? "").Trim()), StringComparison.Ordinal);

    /// <summary>A trimmed optional text: blank → null.</summary>
    public static string OptionalText(string text) => string.IsNullOrWhiteSpace(text) ? null : text.Trim();
}
