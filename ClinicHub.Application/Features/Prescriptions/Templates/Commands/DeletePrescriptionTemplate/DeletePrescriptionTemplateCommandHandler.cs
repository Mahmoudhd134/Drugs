using ClinicHub.Application.Common.Abstractions;
using ClinicHub.Application.Common.Messaging;
using ClinicHub.Application.Common.Results;

namespace ClinicHub.Application.Features.Prescriptions.Templates.Commands.DeletePrescriptionTemplate;

/// <summary>Contract stub (track <c>print-templates/backend</c>; contract § 1.5).</summary>
internal sealed class DeletePrescriptionTemplateCommandHandler(IAppDbContext db)
    : ICommandHandler<DeletePrescriptionTemplateCommand>
{
    public Task<Result> Handle(DeletePrescriptionTemplateCommand command, CancellationToken cancellationToken)
    {
        _ = db;
        throw new NotImplementedException("contract stub");
    }
}
