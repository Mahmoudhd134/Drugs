using ClinicHub.Application.Features.Attachments.Files;

namespace ClinicHub.Api.Features.Attachments;

public static class AttachmentUploadExtensions
{
    /// <summary>For a feature's upload action. A missing file part (null) becomes an empty upload, which answers <c>attachmentEmpty</c>.</summary>
    public static AttachmentUpload ToAttachmentUpload(this IFormFile file) =>
        file is null
            ? new AttachmentUpload("", () => Stream.Null)
            : new AttachmentUpload(file.FileName, file.OpenReadStream);
}
