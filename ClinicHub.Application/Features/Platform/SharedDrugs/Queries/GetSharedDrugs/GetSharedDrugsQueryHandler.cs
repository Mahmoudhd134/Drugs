using ClinicHub.Application.Common.Abstractions;
using ClinicHub.Application.Common.Messaging;
using ClinicHub.Application.Common.Paging;
using ClinicHub.Application.Common.Results;

namespace ClinicHub.Application.Features.Platform.SharedDrugs.Queries.GetSharedDrugs;

internal sealed class GetSharedDrugsQueryHandler(IAppDbContext db, IClinicScope clinicScope) : IQueryHandler<GetSharedDrugsQuery, PagedResult<AdminDrugDto>>
{
    public Task<Result<PagedResult<AdminDrugDto>>> Handle(GetSharedDrugsQuery request, CancellationToken cancellationToken) =>
        throw new NotImplementedException($"M1.7b contract stub (track api), {db.GetType().Name}, {clinicScope.GetType().Name}");
}
