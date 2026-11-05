using ClinicHub.Application.Common.Abstractions;
using ClinicHub.Application.Common.Messaging;
using ClinicHub.Application.Common.Results;
using Microsoft.EntityFrameworkCore;

namespace ClinicHub.Application.Features.Prescriptions.Templates.Commands.DeletePrescriptionTemplate;

/// <summary>Removes the clinic's row when it has one; none is a success too (design § 5).</summary>
internal sealed class DeletePrescriptionTemplateCommandHandler(IAppDbContext db)
    : ICommandHandler<DeletePrescriptionTemplateCommand>
{
    public async Task<Result> Handle(DeletePrescriptionTemplateCommand command, CancellationToken cancellationToken)
    {
        var row = await db.PrescriptionTemplates.FirstOrDefaultAsync(cancellationToken);
        if (row is not null)
        {
            db.PrescriptionTemplates.Remove(row);
            await db.SaveChangesAsync(cancellationToken);
        }

        return Result.Success();
    }
}
