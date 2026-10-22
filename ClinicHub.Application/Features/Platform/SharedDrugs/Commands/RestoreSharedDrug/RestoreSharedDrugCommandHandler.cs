using ClinicHub.Application.Common.Abstractions;
using ClinicHub.Application.Common.Messaging;

using ClinicHub.Application.Common.Results;

namespace ClinicHub.Application.Features.Platform.SharedDrugs.Commands.RestoreSharedDrug;

internal sealed class RestoreSharedDrugCommandHandler(IAppDbContext db, IClinicScope clinicScope) : ICommandHandler<RestoreSharedDrugCommand>
{
    public Task<Result> Handle(RestoreSharedDrugCommand request, CancellationToken cancellationToken) =>
        throw new NotImplementedException($"M1.7b contract stub (track api), {db.GetType().Name}, {clinicScope.GetType().Name}");
}
