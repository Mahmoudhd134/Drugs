using ClinicHub.Application.Common.Abstractions;
using ClinicHub.Application.Common.Messaging;
using ClinicHub.Application.Common.Results;
using Microsoft.EntityFrameworkCore;

namespace ClinicHub.Application.Features.Platform.SharedDrugs.Commands.WithdrawSharedDrug;

/// <summary>Idempotent: a withdrawn drug keeps its first time (<c>Drug.Withdraw</c>).</summary>
internal sealed class WithdrawSharedDrugCommandHandler(IAppDbContext db, IClinicScope clinicScope, TimeProvider clock)
    : ICommandHandler<WithdrawSharedDrugCommand>
{
    public async Task<Result> Handle(WithdrawSharedDrugCommand request, CancellationToken cancellationToken)
    {
        var drug = await db.Drugs.FirstOrDefaultAsync(d => d.Id == request.Id && d.ClinicId == null, cancellationToken);
        if (drug is null)
            return SharedDrugErrors.NotFound;

        drug.Withdraw(clock.GetUtcNow().UtcDateTime);
        using (clinicScope.UseSharedCatalog())
            await db.SaveChangesAsync(cancellationToken);
        return Result.Success();
    }
}
