using ClinicHub.Application.Common.Messaging;
using ClinicHub.Application.Common.Results;

namespace ClinicHub.Application.Features.Forms.Definitions.Queries.GetForm;

/// <summary><b>Stub (feature 1, T1).</b></summary>
internal sealed class GetFormQueryHandler : IQueryHandler<GetFormQuery, FormDetails>
{
    public Task<Result<FormDetails>> Handle(GetFormQuery query, CancellationToken cancellationToken) =>
        throw new NotImplementedException("Dynamic forms feature 1, T1");
}
