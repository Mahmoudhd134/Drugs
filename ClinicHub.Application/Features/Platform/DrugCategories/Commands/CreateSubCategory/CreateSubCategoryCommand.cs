using ClinicHub.Application.Common.Messaging;
using ClinicHub.Application.Features.Catalog.Categories;
namespace ClinicHub.Application.Features.Platform.DrugCategories.Commands.CreateSubCategory;

/// <summary>
/// Order (§ 7): validator → 404 (unknown category) → name taken within the category. Never touches the category row
/// (no <c>UpdatedAt</c> on the parent, D5).
/// </summary>
public record CreateSubCategoryCommand(int CategoryId, string NameEn, string NameAr) : ICommand<SubCategoryDto>;
