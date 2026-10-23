using ClinicHub.Application.Common.Messaging;

namespace ClinicHub.Application.Features.Catalog.Categories.Queries.GetCategories;

/// <summary>Every category with all its subcategories (platform data, no counts): <c>GET /drug-categories</c>.</summary>
public record GetCategoriesQuery : IQuery<List<CategoryDto>>;
