namespace ClinicHub.Application.Features.Attachments.FileTypes;

/// <summary>The 17 known types of docs/design/attachments.md § 5. Config chooses among these; a new one needs a checker here.</summary>
internal static class AttachmentTypes
{
    /// <summary>In the design table's order: png, jpeg, webp, gif, bmp, avif, tiff, heic, pdf, docx, xlsx, pptx, doc, xls, ppt, txt, csv.</summary>
    public static IReadOnlyList<AttachmentType> All => throw new NotImplementedException();

    /// <summary>Null when unknown. Keys are lower case; compared exactly.</summary>
    public static AttachmentType Find(string key) => throw new NotImplementedException();

    /// <summary>Null when unknown. Takes what <c>AttachmentFileName.ExtensionOf</c> gives.</summary>
    public static AttachmentType FindByExtension(string extension) => throw new NotImplementedException();
}
