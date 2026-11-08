using ClinicHub.Application.Common.Messaging;
using ClinicHub.Application.Common.Paging;
using ClinicHub.Application.Common.Results;

namespace ClinicHub.Application.Features.Forms.Definitions.Queries.GetForms;

/// <summary><b>Stub (feature 1, T1).</b></summary>
internal sealed class GetFormsQueryHandler : IQueryHandler<GetFormsQuery, PagedResult<FormSummary>>
{
    public Task<Result<PagedResult<FormSummary>>> Handle(GetFormsQuery query, CancellationToken cancellationToken) =>
        throw new NotImplementedException("Dynamic forms feature 1, T1");
}
