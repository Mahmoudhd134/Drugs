using ClinicHub.Application.Common.Abstractions;
using ClinicHub.Application.Common.Messaging;
using ClinicHub.Application.Common.Results;
using Microsoft.EntityFrameworkCore;

namespace ClinicHub.Application.Features.Platform.SharedDrugs.Commands.RestoreSharedDrug;

/// <summary>Idempotent: an active drug stays as it is.</summary>
internal sealed class RestoreSharedDrugCommandHandler(IAppDbContext db, IClinicScope clinicScope)
    : ICommandHandler<RestoreSharedDrugCommand>
{
    public async Task<Result> Handle(RestoreSharedDrugCommand request, CancellationToken cancellationToken)
    {
        var drug = await db.Drugs.FirstOrDefaultAsync(d => d.Id == request.Id && d.ClinicId == null, cancellationToken);
        if (drug is null)
            return SharedDrugErrors.NotFound;

        drug.Restore();
        using (clinicScope.UseSharedCatalog())
            await db.SaveChangesAsync(cancellationToken);
        return Result.Success();
    }
}
