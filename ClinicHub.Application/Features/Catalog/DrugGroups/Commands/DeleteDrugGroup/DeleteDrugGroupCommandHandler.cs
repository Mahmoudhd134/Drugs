using ClinicHub.Application.Common.Abstractions;
using ClinicHub.Application.Common.Messaging;
using ClinicHub.Application.Common.Results;
using Microsoft.EntityFrameworkCore;

namespace ClinicHub.Application.Features.Catalog.DrugGroups.Commands.DeleteDrugGroup;

internal sealed class DeleteDrugGroupCommandHandler(IAppDbContext db) : ICommandHandler<DeleteDrugGroupCommand>
{
    public async Task<Result> Handle(DeleteDrugGroupCommand command, CancellationToken cancellationToken)
    {
        var group = await db.DrugGroups.FirstOrDefaultAsync(g => g.Id == command.Id, cancellationToken);
        if (group is null)
            return DrugGroupErrors.NotFound;

        db.DrugGroups.Remove(group);
        await db.SaveChangesAsync(cancellationToken);
        return Result.Success();
    }
}
