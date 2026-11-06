using ClinicHub.Application.Common.Abstractions;
using ClinicHub.Application.Common.Messaging;
using ClinicHub.Application.Common.Results;
using ClinicHub.Domain.Prescriptions;
using Microsoft.EntityFrameworkCore;

namespace ClinicHub.Application.Features.Prescriptions.Templates.Commands.SavePrescriptionTemplate;

/// <summary>
/// Creates the clinic's one row or replaces its layout; the last write wins (design § 5). Two first saves in one instant
/// hit the unique index and one answers 500: accepted, near impossible with one super admin.
/// </summary>
internal sealed class SavePrescriptionTemplateCommandHandler(IAppDbContext db)
    : ICommandHandler<SavePrescriptionTemplateCommand, PrescriptionTemplateDto>
{
    public async Task<Result<PrescriptionTemplateDto>> Handle(SavePrescriptionTemplateCommand command, CancellationToken cancellationToken)
    {
        var layout = new PrescriptionLayoutDto(command.SchemaVersion, command.Page, command.Items, command.Calibration);

        var row = await db.PrescriptionTemplates.FirstOrDefaultAsync(cancellationToken);
        if (row is null)
        {
            row = new PrescriptionTemplate();
            db.PrescriptionTemplates.Add(row);
        }
        else
        {
            // Saving the same JSON is still a save (TPL-201; the interceptor sets the time)
            db.Touch(row);
        }

        row.Layout = PrescriptionLayoutRules.Serialize(layout);
        await db.SaveChangesAsync(cancellationToken);

        return new PrescriptionTemplateDto(layout, row.UpdatedAt);
    }
}
