using ClinicHub.Application.Common.Messaging;
using ClinicHub.Application.Features.Catalog.Categories;
namespace ClinicHub.Application.Features.Platform.DrugCategories.Commands.RenameCategory;

/// <summary>Order (§ 7): validator → name taken (the row itself excluded) → 404. Never touches the drugs.</summary>
public record RenameCategoryCommand(int Id, string NameEn, string NameAr) : ICommand<CategoryDto>;
