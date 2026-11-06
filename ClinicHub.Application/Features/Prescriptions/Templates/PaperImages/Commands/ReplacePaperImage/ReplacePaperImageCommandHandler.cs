using ClinicHub.Application.Common.Messaging;
using ClinicHub.Application.Common.Results;
using ClinicHub.Application.Features.Attachments.Files;

namespace ClinicHub.Application.Features.Prescriptions.Templates.PaperImages.Commands.ReplacePaperImage;

/// <summary><b>Stub (T1: backend).</b> Takes <c>IAttachmentService</c>: <c>ReplaceAsync(PaperImageOwner.Current, command.Id, command.File)</c>.</summary>
internal sealed class ReplacePaperImageCommandHandler : ICommandHandler<ReplacePaperImageCommand, AttachmentDto>
{
    public Task<Result<AttachmentDto>> Handle(ReplacePaperImageCommand command, CancellationToken cancellationToken) =>
        throw new NotImplementedException("Step 4, T1");
}
