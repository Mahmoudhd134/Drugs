using ClinicHub.Application.Common.Abstractions;
using ClinicHub.Application.Common.Messaging;

using ClinicHub.Application.Common.Results;

namespace ClinicHub.Application.Features.Platform.SharedDrugs.Queries.GetSharedDrug;

internal sealed class GetSharedDrugQueryHandler(IAppDbContext db, IClinicScope clinicScope) : IQueryHandler<GetSharedDrugQuery, AdminDrugDto>
{
    public Task<Result<AdminDrugDto>> Handle(GetSharedDrugQuery request, CancellationToken cancellationToken) =>
        throw new NotImplementedException($"M1.7b contract stub (track api), {db.GetType().Name}, {clinicScope.GetType().Name}");
}
