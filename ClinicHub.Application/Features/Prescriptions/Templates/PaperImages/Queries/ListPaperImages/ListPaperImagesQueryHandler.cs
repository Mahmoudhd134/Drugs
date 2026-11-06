using ClinicHub.Application.Common.Messaging;
using ClinicHub.Application.Common.Results;
using ClinicHub.Application.Features.Attachments.Files;

namespace ClinicHub.Application.Features.Prescriptions.Templates.PaperImages.Queries.ListPaperImages;

/// <summary><b>Stub (T1: backend).</b> Takes <c>IAttachmentService</c>: <c>ListAsync(PaperImageOwner.Current)</c>.</summary>
internal sealed class ListPaperImagesQueryHandler : IQueryHandler<ListPaperImagesQuery, IReadOnlyList<AttachmentDto>>
{
    public Task<Result<IReadOnlyList<AttachmentDto>>> Handle(ListPaperImagesQuery query, CancellationToken cancellationToken) =>
        throw new NotImplementedException("Step 4, T1");
}
