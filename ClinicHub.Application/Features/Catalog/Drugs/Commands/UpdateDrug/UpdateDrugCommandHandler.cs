using ClinicHub.Application.Common.Abstractions;
using ClinicHub.Application.Common.Messaging;
using ClinicHub.Application.Common.Results;
using ClinicHub.Domain.Catalog;
using Microsoft.EntityFrameworkCore;

namespace ClinicHub.Application.Features.Catalog.Drugs.Commands.UpdateDrug;

internal sealed class UpdateDrugCommandHandler(IAppDbContext db) : ICommandHandler<UpdateDrugCommand, DrugDto>
{
    public async Task<Result<DrugDto>> Handle(UpdateDrugCommand command, CancellationToken cancellationToken)
    {
        var drug = await db.Drugs.FirstOrDefaultAsync(d => d.Id == command.Id, cancellationToken);
        if (drug is null)
            return DrugErrors.NotFound;

        drug.Name = command.Name.Trim();
        drug.Description = string.IsNullOrWhiteSpace(command.Description) ? null : command.Description.Trim();
        drug.DefaultDosing = DosingRules.Normalize(command.DefaultDosing);
        await db.SaveChangesAsync(cancellationToken);
        return drug.ToDto();
    }
}
