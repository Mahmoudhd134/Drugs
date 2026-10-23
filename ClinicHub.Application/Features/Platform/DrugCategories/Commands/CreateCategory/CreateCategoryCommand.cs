using ClinicHub.Application.Common.Messaging;
using ClinicHub.Application.Features.Catalog.Categories;
namespace ClinicHub.Application.Features.Platform.DrugCategories.Commands.CreateCategory;

/// <summary>Order (§ 7): validator (names: <c>ValidName(100)</c>, trimmed) → name taken (409, per language, folded).</summary>
public record CreateCategoryCommand(string NameEn, string NameAr) : ICommand<CategoryDto>;
