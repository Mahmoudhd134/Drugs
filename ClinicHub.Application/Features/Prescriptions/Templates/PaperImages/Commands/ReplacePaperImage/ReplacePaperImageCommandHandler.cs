using ClinicHub.Application.Common.Messaging;
using ClinicHub.Application.Common.Results;
using ClinicHub.Application.Features.Attachments.Files;

namespace ClinicHub.Application.Features.Prescriptions.Templates.PaperImages.Commands.ReplacePaperImage;

/// <summary>Replaces that picture; a picture that's gone answers 404.</summary>
internal sealed class ReplacePaperImageCommandHandler(IAttachmentService attachments) : ICommandHandler<ReplacePaperImageCommand, AttachmentDto>
{
    public Task<Result<AttachmentDto>> Handle(ReplacePaperImageCommand command, CancellationToken cancellationToken) =>
        attachments.ReplaceAsync(PaperImageOwner.Current, command.Id, command.File, cancellationToken);
}