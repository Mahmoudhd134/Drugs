using ClinicHub.Application.Common.Messaging;
using ClinicHub.Application.Features.Catalog.Categories;
namespace ClinicHub.Application.Features.Platform.DrugCategories.Commands.RenameSubCategory;

/// <summary>Rename only (a <c>categoryId</c> in the body is ignored). Order: validator → 404 → name taken.</summary>
public record RenameSubCategoryCommand(int Id, string NameEn, string NameAr) : ICommand<SubCategoryDto>;
