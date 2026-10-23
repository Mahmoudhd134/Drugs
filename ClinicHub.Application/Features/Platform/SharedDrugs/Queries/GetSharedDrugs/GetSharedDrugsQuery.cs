using ClinicHub.Application.Common.Messaging;
using ClinicHub.Application.Common.Paging;
namespace ClinicHub.Application.Features.Platform.SharedDrugs.Queries.GetSharedDrugs;

/// <summary>
/// A page of the shared catalog (the platform filter shows only shared drugs), filtered by <c>SharedDrugStatus</c>
/// (default active) and the category filters, with the clinic list's search and order (design M1.7 D7, D8).
/// </summary>
public record GetSharedDrugsQuery(string Search, string Status, int? CategoryId, string SubCategoryId, int Page, int PageSize)
    : IQuery<PagedResult<AdminDrugDto>>;
