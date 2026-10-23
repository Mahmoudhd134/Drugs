namespace ClinicHub.Application.Features.Catalog.Drugs.Queries.GetDrugTree;

/// <summary>
/// <c>GET /drugs/tree</c> (design M1.7 D8). Only categories and subcategories with at least one match are listed
/// (without a search too). Categories by id, their subcategories by id, the «بدون تصنيف فرعي» bucket last: the SPA
/// sorts for display (D5).
/// </summary>
public record DrugTreeDto(List<DrugTreeCategoryDto> Categories);

/// <param name="Count">The sum of its subcategories' counts (the bucket included).</param>
public record DrugTreeCategoryDto(int Id, string NameEn, string NameAr, bool PinnedLast, int Count,
    List<DrugTreeSubCategoryDto> SubCategories);

/// <summary>A subcategory, or (all names and the id null) the category's drugs without one.</summary>
public record DrugTreeSubCategoryDto(int? Id, string NameEn, string NameAr, bool PinnedLast, int Count);
