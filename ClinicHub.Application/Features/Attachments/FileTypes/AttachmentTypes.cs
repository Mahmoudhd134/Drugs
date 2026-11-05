namespace ClinicHub.Application.Features.Attachments.FileTypes;

/// <summary>The 17 known types of docs/design/attachments.md § 5. Config chooses among these; a new one needs a checker here.</summary>
internal static class AttachmentTypes
{
    private static readonly AttachmentType[] Types =
    [
        new("png", [".png"], "image/png"),
        new("jpeg", [".jpg", ".jpeg"], "image/jpeg"),
        new("webp", [".webp"], "image/webp"),
        new("gif", [".gif"], "image/gif"),
        new("bmp", [".bmp"], "image/bmp"),
        new("avif", [".avif"], "image/avif"),
        new("tiff", [".tif", ".tiff"], "image/tiff"),
        new("heic", [".heic", ".heif"], "image/heic"),
        new("pdf", [".pdf"], "application/pdf"),
        new("docx", [".docx"], "application/vnd.openxmlformats-officedocument.wordprocessingml.document"),
        new("xlsx", [".xlsx"], "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"),
        new("pptx", [".pptx"], "application/vnd.openxmlformats-officedocument.presentationml.presentation"),
        new("doc", [".doc"], "application/msword"),
        new("xls", [".xls"], "application/vnd.ms-excel"),
        new("ppt", [".ppt"], "application/vnd.ms-powerpoint"),
        new("txt", [".txt"], "text/plain"),
        new("csv", [".csv"], "text/csv"),
    ];

    private static readonly Dictionary<string, AttachmentType> ByKey = Types.ToDictionary(t => t.Key, StringComparer.Ordinal);

    private static readonly Dictionary<string, AttachmentType> ByExtension = Types
        .SelectMany(t => t.Extensions, (type, extension) => (type, extension))
        .ToDictionary(x => x.extension, x => x.type, StringComparer.Ordinal);

    /// <summary>In the design table's order: png, jpeg, webp, gif, bmp, avif, tiff, heic, pdf, docx, xlsx, pptx, doc, xls, ppt, txt, csv.</summary>
    public static IReadOnlyList<AttachmentType> All => Types;

    /// <summary>Null when unknown. Keys are lower case; compared exactly.</summary>
    public static AttachmentType Find(string key) => key is null ? null : ByKey.GetValueOrDefault(key);

    /// <summary>Null when unknown. Takes what <c>AttachmentFileName.ExtensionOf</c> gives.</summary>
    public static AttachmentType FindByExtension(string extension) =>
        extension is null ? null : ByExtension.GetValueOrDefault(extension);
}
