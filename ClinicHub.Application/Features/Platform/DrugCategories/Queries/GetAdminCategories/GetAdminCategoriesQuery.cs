using ClinicHub.Application.Common.Messaging;
using ClinicHub.Application.Features.Catalog.Categories;
namespace ClinicHub.Application.Features.Platform.DrugCategories.Queries.GetAdminCategories;

/// <summary>Every category and subcategory with the counts (<c>IgnoreQueryFilters()</c> on drugs: Platform code).</summary>
public record GetAdminCategoriesQuery : IQuery<List<AdminCategoryDto>>;
