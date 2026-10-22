using ClinicHub.Application.Common.Abstractions;
using ClinicHub.Application.Common.Messaging;
using ClinicHub.Application.Common.Results;
using Microsoft.EntityFrameworkCore;

namespace ClinicHub.Application.Features.Catalog.Drugs.Commands.DeleteDrug;

/// <summary>404 → <c>sharedDrugReadOnly</c> (§ 7): shared drugs are withdrawn by the super admin, never deleted.</summary>
internal sealed class DeleteDrugCommandHandler(IAppDbContext db) : ICommandHandler<DeleteDrugCommand>
{
    public async Task<Result> Handle(DeleteDrugCommand command, CancellationToken cancellationToken)
    {
        var drug = await db.Drugs.FirstOrDefaultAsync(d => d.Id == command.Id, cancellationToken);
        if (drug is null)
            return DrugErrors.NotFound;
        if (drug.ClinicId is null)
            return DrugErrors.SharedDrugReadOnly;

        db.Drugs.Remove(drug);
        await db.SaveChangesAsync(cancellationToken);
        return Result.Success();
    }
}
