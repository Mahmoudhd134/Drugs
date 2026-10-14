using ClinicHub.Application.Common.Abstractions;
using ClinicHub.Application.Common.Messaging;
using ClinicHub.Application.Common.Results;
using Microsoft.EntityFrameworkCore;

namespace ClinicHub.Application.Features.Catalog.Drugs.Commands.DeleteDrug;

internal sealed class DeleteDrugCommandHandler(IAppDbContext db) : ICommandHandler<DeleteDrugCommand>
{
    public async Task<Result> Handle(DeleteDrugCommand command, CancellationToken cancellationToken)
    {
        var drug = await db.Drugs.FirstOrDefaultAsync(d => d.Id == command.Id, cancellationToken);
        if (drug is null)
            return DrugErrors.NotFound;

        db.Drugs.Remove(drug);
        await db.SaveChangesAsync(cancellationToken);
        return Result.Success();
    }
}
