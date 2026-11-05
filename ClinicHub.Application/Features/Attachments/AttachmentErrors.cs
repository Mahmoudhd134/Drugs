using ClinicHub.Application.Common.Results;

namespace ClinicHub.Application.Features.Attachments;

/// <summary>
/// Attachment errors (docs/design/attachments.md § 5). File name rules reuse <see cref="CommonErrors.NameInvalid"/> and
/// <see cref="CommonErrors.NameTooLong"/>.
/// </summary>
public static class AttachmentErrors
{
    /// <summary>An extension unknown or not allowed for the module, no name or extension, or content that doesn't prove the extension's type.</summary>
    public static readonly Error TypeNotAllowed =
        new("attachmentTypeNotAllowed", "This file type is not allowed.", ErrorType.Validation);

    public static readonly Error TooLarge =
        new("attachmentTooLarge", "This file is larger than allowed.", ErrorType.Validation);

    /// <summary>A zero-byte file, or a request with no file part.</summary>
    public static readonly Error Empty =
        new("attachmentEmpty", "This file is empty.", ErrorType.Validation);

    /// <summary>Code <c>notFound</c>: a missing or deleted file, another owner's, or another clinic's.</summary>
    public static readonly Error NotFound =
        new(CommonErrors.NotFound.Code, "The file does not exist.", ErrorType.NotFound);
}
