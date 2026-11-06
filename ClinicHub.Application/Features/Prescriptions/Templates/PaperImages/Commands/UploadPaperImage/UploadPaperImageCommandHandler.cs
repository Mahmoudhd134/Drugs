using ClinicHub.Application.Common.Messaging;
using ClinicHub.Application.Common.Results;
using ClinicHub.Application.Features.Attachments.Files;

namespace ClinicHub.Application.Features.Prescriptions.Templates.PaperImages.Commands.UploadPaperImage;

/// <summary><b>Stub (T1: backend).</b> Takes <c>IAttachmentService</c>. <c>ListAsync(PaperImageOwner.Current)</c> first: with a row, <c>ReplaceAsync</c> on the newest; with none, <c>AddAsync</c>. So a stale screen that thinks there's no picture still keeps "one per clinic" (step 4 design § 4). Two uploads in one instant can leave two live rows: accepted (attachments § 6).</summary>
internal sealed class UploadPaperImageCommandHandler : ICommandHandler<UploadPaperImageCommand, AttachmentDto>
{
    public Task<Result<AttachmentDto>> Handle(UploadPaperImageCommand command, CancellationToken cancellationToken) =>
        throw new NotImplementedException("Step 4, T1");
}
