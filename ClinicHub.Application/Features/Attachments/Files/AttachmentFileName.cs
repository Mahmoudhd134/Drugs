using ClinicHub.Application.Common.Results;
using ClinicHub.Application.Common.Validation;
using ClinicHub.Domain.Common;

namespace ClinicHub.Application.Features.Attachments.Files;

/// <summary>The file name rules of docs/design/attachments.md § 5, pure and independent of the OS: no <c>Path</c> call.</summary>
internal static class AttachmentFileName
{
    /// <summary>The last segment of what the client sent (both <c>/</c> and <c>\</c> separate), trimmed; empty for null.</summary>
    public static string Clean(string clientName) =>
        clientName is null ? "" : clientName[(clientName.LastIndexOfAny(['/', '\\']) + 1)..].Trim();

    /// <summary>
    /// For a cleaned name, the first failure or null: blank (spaces or format characters only) =
    /// <see cref="AttachmentErrors.TypeNotAllowed"/>; the characters <c>ValidName</c> refuses = <see cref="CommonErrors.NameInvalid"/>;
    /// over 256 = <see cref="CommonErrors.NameTooLong"/>.
    /// </summary>
    public static Error Check(string cleanName)
    {
        if (ValidationExtensions.IsBlank(cleanName))
            return AttachmentErrors.TypeNotAllowed;
        if (ValidationExtensions.HasInvalidNameCharacter(cleanName))
            return CommonErrors.NameInvalid;
        return cleanName.Length > FieldLimits.AttachmentFileNameMaxLength ? CommonErrors.NameTooLong : null;
    }

    /// <summary>The last extension, lower case with its dot (<c>.png</c>); null for no extension, a trailing dot, or only an extension (<c>.png</c>).</summary>
    public static string ExtensionOf(string cleanName)
    {
        var dot = cleanName?.LastIndexOf('.') ?? -1;
        if (dot < 0 || dot == cleanName.Length - 1 || ValidationExtensions.IsBlank(cleanName[..dot]))
            return null;
        return cleanName[dot..].ToLowerInvariant();
    }
}
