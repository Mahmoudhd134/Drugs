using ClinicHub.Application.Common.Messaging;
using ClinicHub.Application.Common.Results;
using ClinicHub.Application.Features.Attachments.Files;

namespace ClinicHub.Application.Features.Prescriptions.Templates.PaperImages.Queries.OpenPaperImage;

/// <summary>The picture's bytes; a picture that's gone answers 404.</summary>
internal sealed class OpenPaperImageQueryHandler(IAttachmentService attachments) : IQueryHandler<OpenPaperImageQuery, AttachmentContent>
{
    public Task<Result<AttachmentContent>> Handle(OpenPaperImageQuery query, CancellationToken cancellationToken) =>
        attachments.OpenAsync(PaperImageOwner.Current, query.Id, cancellationToken);
}