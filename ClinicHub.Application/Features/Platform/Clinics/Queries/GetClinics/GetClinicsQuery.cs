using ClinicHub.Application.Common.Messaging;
using ClinicHub.Application.Common.Paging;

namespace ClinicHub.Application.Features.Platform.Clinics.Queries.GetClinics;

/// <summary>
/// A page of the managed clinics (no template, no deleted) by name; with a search term, names starting with
/// it come first.
/// </summary>
/// <param name="Status">Optional filter, one of <c>ClinicStatus</c>; any other value matches nothing.</param>
public record GetClinicsQuery(string Search, string Status, int Page, int PageSize) : IQuery<PagedResult<ClinicSummary>>;
