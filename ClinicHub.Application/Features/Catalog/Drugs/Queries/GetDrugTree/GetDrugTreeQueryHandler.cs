using ClinicHub.Application.Common.Abstractions;
using ClinicHub.Application.Common.Messaging;
using ClinicHub.Application.Common.Results;

namespace ClinicHub.Application.Features.Catalog.Drugs.Queries.GetDrugTree;

/// <summary>
/// One aggregate query over <see cref="DrugQueries.ListedAsync"/> (search + source, no category filter): counts per
/// <c>(CategoryId, SubCategoryId)</c>, joined in memory with the ≤ ~205 category and subcategory rows
/// (<c>CategoryIds.IsPinnedLast</c>, <c>SubCategoryIds.IsPinnedLast</c>). M1.7c contract stub (track api).
/// </summary>
internal sealed class GetDrugTreeQueryHandler(IAppDbContext db) : IQueryHandler<GetDrugTreeQuery, DrugTreeDto>
{
    public Task<Result<DrugTreeDto>> Handle(GetDrugTreeQuery query, CancellationToken cancellationToken)
    {
        _ = db;
        throw new NotImplementedException("M1.7c contract stub (track api)");
    }
}
