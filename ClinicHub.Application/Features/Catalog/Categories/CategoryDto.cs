using ClinicHub.Domain.Catalog;

namespace ClinicHub.Application.Features.Catalog.Categories;

/// <summary>A category or subcategory as a drug carries it: both names (the SPA shows the UI language's).</summary>
public record CategoryNameDto(int Id, string NameEn, string NameAr);

/// <param name="PinnedLast">True only for <see cref="SubCategoryIds.Unclassified"/>.</param>
public record SubCategoryDto(int Id, string NameEn, string NameAr, bool PinnedLast);

/// <summary><c>GET /drug-categories</c> (design M1.7 D8): every category with all its subcategories, no counts.</summary>
/// <param name="PinnedLast">True only for <see cref="CategoryIds.Other"/>.</param>
public record CategoryDto(int Id, string NameEn, string NameAr, bool PinnedLast, List<SubCategoryDto> SubCategories);

public static class CategoryMappings
{
    public static CategoryNameDto ToNameDto(this Category category) => new(category.Id, category.NameEn, category.NameAr);

    public static CategoryNameDto ToNameDto(this SubCategory subCategory) =>
        new(subCategory.Id, subCategory.NameEn, subCategory.NameAr);

    public static SubCategoryDto ToDto(this SubCategory subCategory) =>
        new(subCategory.Id, subCategory.NameEn, subCategory.NameAr, SubCategoryIds.IsPinnedLast(subCategory.Id));

    /// <summary>Needs <see cref="Category.SubCategories"/> loaded; subcategories by id (the SPA sorts by name).</summary>
    public static CategoryDto ToDto(this Category category) => new(category.Id, category.NameEn, category.NameAr,
        CategoryIds.IsPinnedLast(category.Id), category.SubCategories.OrderBy(s => s.Id).Select(s => s.ToDto()).ToList());
}
