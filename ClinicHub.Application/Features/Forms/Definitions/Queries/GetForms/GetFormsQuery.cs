using ClinicHub.Application.Common.Messaging;
using ClinicHub.Application.Common.Paging;

namespace ClinicHub.Application.Features.Forms.Definitions.Queries.GetForms;

/// <summary>A page of the forms not deleted, by name; with a search term, names starting with it come first.</summary>
public record GetFormsQuery(string Search, int Page, int PageSize) : IQuery<PagedResult<FormSummary>>;
