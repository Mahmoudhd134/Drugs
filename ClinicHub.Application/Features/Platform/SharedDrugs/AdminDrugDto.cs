using ClinicHub.Application.Features.Catalog.Categories;

namespace ClinicHub.Application.Features.Platform.SharedDrugs;

/// <summary>
/// A shared drug in the super admin's catalog (design M1.7 D8): <c>DrugDto</c> without <c>defaultDosing</c> and
/// <c>isShared</c>, plus <paramref name="WithdrawnAt"/>. No Arabic name (no DTO has one).
/// </summary>
/// <param name="WithdrawnAt">UTC; null while active.</param>
public record AdminDrugDto(int Id, string Name, string ActiveIngredients, string Description, bool Withdrawn,
    DateTime? WithdrawnAt, CategoryNameDto Category, CategoryNameDto SubCategory);
