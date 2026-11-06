using ClinicHub.Application.Common.Messaging;
using ClinicHub.Application.Common.Results;
using ClinicHub.Application.Features.Attachments.Files;

namespace ClinicHub.Application.Features.Prescriptions.Templates.PaperImages.Commands.UploadPaperImage;

/// <summary>Lists first: with a row, replaces the newest; with none, adds. So a stale screen that thinks there's no picture still keeps "one per clinic" (step 4 design § 4). Two uploads in one instant can leave two live rows: accepted (attachments § 6).</summary>
internal sealed class UploadPaperImageCommandHandler(IAttachmentService attachments) : ICommandHandler<UploadPaperImageCommand, AttachmentDto>
{
    public async Task<Result<AttachmentDto>> Handle(UploadPaperImageCommand command, CancellationToken cancellationToken)
    {
        var current = await attachments.ListAsync(PaperImageOwner.Current, cancellationToken);

        return current.Count == 0
            ? await attachments.AddAsync(PaperImageOwner.Current, command.File, cancellationToken)
            : await attachments.ReplaceAsync(PaperImageOwner.Current, current[0].Id, command.File, cancellationToken);
    }
}