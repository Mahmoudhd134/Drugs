using ClinicHub.Application.Common.Messaging;
using ClinicHub.Application.Common.Results;

namespace ClinicHub.Application.Features.Prescriptions.Templates.PaperImages.Commands.DeletePaperImage;

/// <summary><b>Stub (T1: backend).</b> Takes <c>IAttachmentService</c>: <c>DeleteAsync(PaperImageOwner.Current, command.Id)</c>.</summary>
internal sealed class DeletePaperImageCommandHandler : ICommandHandler<DeletePaperImageCommand>
{
    public Task<Result> Handle(DeletePaperImageCommand command, CancellationToken cancellationToken) =>
        throw new NotImplementedException("Step 4, T1");
}
