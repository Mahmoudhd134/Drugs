using ClinicHub.Application.Features.Catalog.Categories;
using ClinicHub.Domain.Catalog;

namespace ClinicHub.Application.Features.Platform.SharedDrugs;

internal static class AdminDrugMappings
{
    /// <summary>Needs the category and subcategory loaded (<c>WithCategories</c>). Never the hidden Arabic name.</summary>
    public static AdminDrugDto ToAdminDto(this Drug drug) => new(drug.Id, drug.Name, drug.ActiveIngredients,
        drug.Description, drug.IsWithdrawn, drug.WithdrawnAt, drug.Category.ToNameDto(), drug.SubCategory?.ToNameDto());
}
