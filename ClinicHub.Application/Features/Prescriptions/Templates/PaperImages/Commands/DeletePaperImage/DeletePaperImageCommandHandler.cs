using ClinicHub.Application.Common.Messaging;
using ClinicHub.Application.Common.Results;
using ClinicHub.Application.Features.Attachments.Files;

namespace ClinicHub.Application.Features.Prescriptions.Templates.PaperImages.Commands.DeletePaperImage;

/// <summary>Marks the row; the file stays (attachments A8). A picture that's gone answers 404.</summary>
internal sealed class DeletePaperImageCommandHandler(IAttachmentService attachments) : ICommandHandler<DeletePaperImageCommand>
{
    public Task<Result> Handle(DeletePaperImageCommand command, CancellationToken cancellationToken) =>
        attachments.DeleteAsync(PaperImageOwner.Current, command.Id, cancellationToken);
}