using ClinicHub.Application.Common.Abstractions;
using ClinicHub.Application.Common.Messaging;

using ClinicHub.Application.Common.Results;

namespace ClinicHub.Application.Features.Platform.SharedDrugs.Commands.WithdrawSharedDrug;

internal sealed class WithdrawSharedDrugCommandHandler(IAppDbContext db, IClinicScope clinicScope) : ICommandHandler<WithdrawSharedDrugCommand>
{
    public Task<Result> Handle(WithdrawSharedDrugCommand request, CancellationToken cancellationToken) =>
        throw new NotImplementedException($"M1.7b contract stub (track api), {db.GetType().Name}, {clinicScope.GetType().Name}");
}
