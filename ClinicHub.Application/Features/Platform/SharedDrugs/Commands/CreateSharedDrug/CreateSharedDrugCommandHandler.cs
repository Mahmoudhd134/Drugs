using ClinicHub.Application.Common.Abstractions;
using ClinicHub.Application.Common.Messaging;

using ClinicHub.Application.Common.Results;

namespace ClinicHub.Application.Features.Platform.SharedDrugs.Commands.CreateSharedDrug;

internal sealed class CreateSharedDrugCommandHandler(IAppDbContext db, IClinicScope clinicScope) : ICommandHandler<CreateSharedDrugCommand, AdminDrugDto>
{
    public Task<Result<AdminDrugDto>> Handle(CreateSharedDrugCommand request, CancellationToken cancellationToken) =>
        throw new NotImplementedException($"M1.7b contract stub (track api), {db.GetType().Name}, {clinicScope.GetType().Name}");
}
