namespace ClinicHub.Application.Features.Platform.DrugCategories;

/// <param name="DrugCount">Shared drugs (withdrawn included) + every clinic's own drugs, deleted clinics included.</param>
/// <param name="DeletedClinicsDrugCount">The part of <paramref name="DrugCount"/> held by deleted clinics.</param>
public record AdminSubCategoryDto(int Id, string NameEn, string NameAr, bool PinnedLast, int DrugCount,
    int DeletedClinicsDrugCount);

/// <summary>
/// <c>GET /admin/drug-categories</c> (design M1.7 D8): <c>CategoryDto</c> with the counts on both levels. Super admin
/// only: numbers, never a clinic or drug name.
/// </summary>
/// <param name="DrugCount">Every drug in the category (with or without a subcategory), counted like the subcategories'.</param>
/// <param name="NoSubCategoryDrugCount">The «بدون تصنيف فرعي» row: the category's drugs without a subcategory.</param>
public record AdminCategoryDto(int Id, string NameEn, string NameAr, bool PinnedLast, int DrugCount,
    int DeletedClinicsDrugCount, int NoSubCategoryDrugCount, List<AdminSubCategoryDto> SubCategories);
