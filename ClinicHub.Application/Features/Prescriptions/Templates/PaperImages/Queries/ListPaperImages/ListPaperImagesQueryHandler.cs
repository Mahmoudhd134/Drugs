using ClinicHub.Application.Common.Messaging;
using ClinicHub.Application.Common.Results;
using ClinicHub.Application.Features.Attachments.Files;

namespace ClinicHub.Application.Features.Prescriptions.Templates.PaperImages.Queries.ListPaperImages;

/// <summary>The clinic's live pictures, newest first: normally one row.</summary>
internal sealed class ListPaperImagesQueryHandler(IAttachmentService attachments) : IQueryHandler<ListPaperImagesQuery, IReadOnlyList<AttachmentDto>>
{
    public async Task<Result<IReadOnlyList<AttachmentDto>>> Handle(ListPaperImagesQuery query, CancellationToken cancellationToken) =>
        Result<IReadOnlyList<AttachmentDto>>.Success(await attachments.ListAsync(PaperImageOwner.Current, cancellationToken));
}