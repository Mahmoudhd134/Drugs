using ClinicHub.Application.Common.Abstractions;
using ClinicHub.Application.Common.Messaging;

using ClinicHub.Application.Common.Results;

namespace ClinicHub.Application.Features.Platform.SharedDrugs.Commands.UpdateSharedDrug;

internal sealed class UpdateSharedDrugCommandHandler(IAppDbContext db, IClinicScope clinicScope) : ICommandHandler<UpdateSharedDrugCommand, AdminDrugDto>
{
    public Task<Result<AdminDrugDto>> Handle(UpdateSharedDrugCommand request, CancellationToken cancellationToken) =>
        throw new NotImplementedException($"M1.7b contract stub (track api), {db.GetType().Name}, {clinicScope.GetType().Name}");
}
