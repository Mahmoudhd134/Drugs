using ClinicHub.Application.Common.Messaging;
using ClinicHub.Application.Common.Paging;

namespace ClinicHub.Application.Features.Catalog.Drugs.Queries.GetDrugs;

/// <summary>A page of drugs by name; with a search term, names starting with it come first.</summary>
public record GetDrugsQuery(string Search, int Page, int PageSize) : IQuery<PagedResult<DrugDto>>;
