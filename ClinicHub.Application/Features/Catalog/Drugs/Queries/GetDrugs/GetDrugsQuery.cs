using ClinicHub.Application.Common.Messaging;
using ClinicHub.Application.Common.Paging;

namespace ClinicHub.Application.Features.Catalog.Drugs.Queries.GetDrugs;

/// <summary>
/// A page of the clinic's visible drugs (own + active shared; design M1.7 D7, D8) in the D7 order.
/// </summary>
/// <param name="Source">See <see cref="DrugSource"/>.</param>
/// <param name="SubCategoryId">See <see cref="SubCategoryFilter"/>; requires <paramref name="CategoryId"/>.</param>
public record GetDrugsQuery(string Search, string Source, int? CategoryId, string SubCategoryId, int Page, int PageSize)
    : IQuery<PagedResult<DrugDto>>;
