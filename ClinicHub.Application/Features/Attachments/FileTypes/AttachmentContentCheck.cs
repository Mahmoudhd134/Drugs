namespace ClinicHub.Application.Features.Attachments.FileTypes;

/// <summary>Does the content prove the type its extension picked (docs/design/attachments.md § 5)? Never throws for bad content.</summary>
internal static class AttachmentContentCheck
{
    /// <param name="typeKey">A key of <c>AttachmentTypes.All</c>; any other throws.</param>
    /// <param name="content">Seekable, at its start. Text is scanned whole, as a stream; a ZIP's entries are listed, never extracted.</param>
    public static bool Matches(string typeKey, Stream content) => throw new NotImplementedException();
}
