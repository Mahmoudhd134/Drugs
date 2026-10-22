using ClinicHub.Application.Common.Abstractions;
using ClinicHub.Application.Common.Messaging;
using ClinicHub.Application.Common.Results;
using ClinicHub.Application.Features.Catalog.Categories;
namespace ClinicHub.Application.Features.Platform.DrugCategories.Queries.GetAdminCategories;

internal sealed class GetAdminCategoriesQueryHandler(IAppDbContext db) : IQueryHandler<GetAdminCategoriesQuery, List<AdminCategoryDto>>
{
    public Task<Result<List<AdminCategoryDto>>> Handle(GetAdminCategoriesQuery request, CancellationToken cancellationToken) =>
        throw new NotImplementedException($"M1.7b contract stub (track api), {db.GetType().Name}");
}
