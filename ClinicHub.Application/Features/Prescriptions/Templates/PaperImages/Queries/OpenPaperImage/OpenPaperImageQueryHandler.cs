using ClinicHub.Application.Common.Messaging;
using ClinicHub.Application.Common.Results;
using ClinicHub.Application.Features.Attachments.Files;

namespace ClinicHub.Application.Features.Prescriptions.Templates.PaperImages.Queries.OpenPaperImage;

/// <summary><b>Stub (T1: backend).</b> Takes <c>IAttachmentService</c>: <c>OpenAsync(PaperImageOwner.Current, query.Id)</c>.</summary>
internal sealed class OpenPaperImageQueryHandler : IQueryHandler<OpenPaperImageQuery, AttachmentContent>
{
    public Task<Result<AttachmentContent>> Handle(OpenPaperImageQuery query, CancellationToken cancellationToken) =>
        throw new NotImplementedException("Step 4, T1");
}
