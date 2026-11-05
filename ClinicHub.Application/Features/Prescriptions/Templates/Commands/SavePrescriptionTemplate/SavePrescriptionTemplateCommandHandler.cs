using ClinicHub.Application.Common.Abstractions;
using ClinicHub.Application.Common.Messaging;
using ClinicHub.Application.Common.Results;

namespace ClinicHub.Application.Features.Prescriptions.Templates.Commands.SavePrescriptionTemplate;

/// <summary>Contract stub (track <c>print-templates/backend</c>; contract § 1.5).</summary>
internal sealed class SavePrescriptionTemplateCommandHandler(IAppDbContext db)
    : ICommandHandler<SavePrescriptionTemplateCommand, PrescriptionTemplateDto>
{
    public Task<Result<PrescriptionTemplateDto>> Handle(SavePrescriptionTemplateCommand command, CancellationToken cancellationToken)
    {
        _ = db;
        throw new NotImplementedException("contract stub");
    }
}
