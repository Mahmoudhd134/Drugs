using ClinicHub.Application.Features.Catalog.Categories;
using ClinicHub.Domain.Catalog;
using Microsoft.EntityFrameworkCore;

namespace ClinicHub.Application.Features.Catalog.Drugs;

/// <summary>
/// A drug as the clinic API returns it (design M1.7 D8). Never carries the hidden Arabic name (<c>Drug.NameAr</c>).
/// </summary>
/// <param name="ActiveIngredients">Null when none.</param>
/// <param name="DefaultDosing">Null when not set (always null for a shared drug).</param>
/// <param name="IsShared">True for a platform catalog drug (<c>ClinicId</c> null).</param>
/// <param name="Withdrawn">A withdrawn shared drug (only reachable by id or through a protocol).</param>
/// <param name="SubCategory">Null = «بدون تصنيف فرعي».</param>
public record DrugDto(int Id, string Name, string ActiveIngredients, string Description, Dosing DefaultDosing,
    bool IsShared, bool Withdrawn, CategoryNameDto Category, CategoryNameDto SubCategory);

/// <summary>
/// The drug of a protocol line (design M1.7 D8): no category (protocol queries don't load categories), no Arabic name.
/// </summary>
public record ProtocolDrugDto(int Id, string Name, string Description, Dosing DefaultDosing, bool IsShared, bool Withdrawn);

public static class DrugMappings
{
    /// <summary>Needs <see cref="Drug.Category"/> and <see cref="Drug.SubCategory"/> loaded (<see cref="WithCategories"/>).</summary>
    public static DrugDto ToDto(this Drug drug) => new(drug.Id, drug.Name, drug.ActiveIngredients, drug.Description,
        drug.DefaultDosing, drug.ClinicId is null, drug.IsWithdrawn, drug.Category.ToNameDto(), drug.SubCategory?.ToNameDto());

    public static ProtocolDrugDto ToProtocolDrugDto(this Drug drug) => new(drug.Id, drug.Name, drug.Description,
        drug.DefaultDosing, drug.ClinicId is null, drug.IsWithdrawn);

    /// <summary>Loads each drug's category and subcategory, as <see cref="ToDto"/> needs.</summary>
    public static IQueryable<Drug> WithCategories(this IQueryable<Drug> query) =>
        query.Include(d => d.Category).Include(d => d.SubCategory);
}
