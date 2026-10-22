using ClinicHub.Application.Common.Abstractions;
using ClinicHub.Application.Common.Messaging;
using ClinicHub.Application.Common.Results;

namespace ClinicHub.Application.Features.Catalog.Categories.Queries.GetCategories;

internal sealed class GetCategoriesQueryHandler(IAppDbContext db) : IQueryHandler<GetCategoriesQuery, List<CategoryDto>>
{
    public Task<Result<List<CategoryDto>>> Handle(GetCategoriesQuery query, CancellationToken cancellationToken) =>
        throw new NotImplementedException($"M1.7b contract stub (track api), {db.GetType().Name}");
}
