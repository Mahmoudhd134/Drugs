using ClinicHub.Application.Common.Abstractions;
using ClinicHub.Application.Common.Messaging;
using ClinicHub.Application.Common.Results;
using ClinicHub.Domain.Catalog;

namespace ClinicHub.Application.Features.Catalog.Drugs.Commands.CreateDrug;

internal sealed class CreateDrugCommandHandler(IAppDbContext db) : ICommandHandler<CreateDrugCommand, DrugDto>
{
    public async Task<Result<DrugDto>> Handle(CreateDrugCommand command, CancellationToken cancellationToken)
    {
        var drug = new Drug
        {
            Name = command.Name.Trim(),
            Description = string.IsNullOrWhiteSpace(command.Description) ? null : command.Description.Trim(),
            DefaultDosing = DosingRules.Normalize(command.DefaultDosing),
        };
        db.Drugs.Add(drug);
        await db.SaveChangesAsync(cancellationToken);
        return drug.ToDto();
    }
}
