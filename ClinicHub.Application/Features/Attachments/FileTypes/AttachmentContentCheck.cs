using System.Buffers;
using System.IO.Compression;
using System.Text;

namespace ClinicHub.Application.Features.Attachments.FileTypes;

/// <summary>Does the content prove the type its extension picked (docs/design/attachments.md § 5)? Never throws for bad content.</summary>
internal static class AttachmentContentCheck
{
    /// <summary>The longest signature check reads this far: a four-byte brand at byte 8.</summary>
    private const int HeaderLength = 12;

    private const string ContentTypesEntry = "[Content_Types].xml";
    private const string VbaProjectEntry = "vbaProject.bin";

    private static ReadOnlySpan<byte> Png => [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A];
    private static ReadOnlySpan<byte> Jpeg => [0xFF, 0xD8, 0xFF];
    private static ReadOnlySpan<byte> TiffLittleEndian => [0x49, 0x49, 0x2A, 0x00];
    private static ReadOnlySpan<byte> TiffBigEndian => [0x4D, 0x4D, 0x00, 0x2A];
    private static ReadOnlySpan<byte> OfficeCompound => [0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1];
    private static ReadOnlySpan<byte> ZipLocalHeader => [0x50, 0x4B, 0x03, 0x04];
    private static ReadOnlySpan<byte> Utf16LittleEndianMark => [0xFF, 0xFE];
    private static ReadOnlySpan<byte> Utf16BigEndianMark => [0xFE, 0xFF];

    /// <summary>The C0 controls a text file can't hold: all but tab, LF, form feed and CR.</summary>
    private static readonly SearchValues<byte> ForbiddenInText = SearchValues.Create(
        Enumerable.Range(0, 0x20).Where(b => b is not (0x09 or 0x0A or 0x0C or 0x0D)).Select(b => (byte)b).ToArray());

    /// <param name="typeKey">A key of <c>AttachmentTypes.All</c>; any other throws.</param>
    /// <param name="content">Seekable, at its start. Text is scanned whole, as a stream; a ZIP's entries are listed, never extracted.</param>
    public static bool Matches(string typeKey, Stream content) => typeKey switch
    {
        "png" => Header(content).StartsWith(Png),
        "jpeg" => Header(content).StartsWith(Jpeg),
        "webp" => IsWebp(Header(content)),
        "gif" => IsGif(Header(content)),
        "bmp" => Header(content).StartsWith("BM"u8),
        "avif" => BrandOf(Header(content)) is "avif" or "avis",
        "tiff" => IsTiff(Header(content)),
        "heic" => BrandOf(Header(content)) is "heic" or "heix" or "hevc" or "mif1" or "msf1",
        "pdf" => Header(content).StartsWith("%PDF-"u8),
        "docx" => IsOpenXml(content, "word/document.xml"),
        "xlsx" => IsOpenXml(content, "xl/workbook.xml"),
        "pptx" => IsOpenXml(content, "ppt/presentation.xml"),
        "doc" or "xls" or "ppt" => Header(content).StartsWith(OfficeCompound),
        "txt" or "csv" => IsText(content),
        _ => throw new ArgumentException($"'{typeKey}' is not a known attachment type.", nameof(typeKey)),
    };

    /// <summary>What the stream holds of the first <see cref="HeaderLength"/> bytes: less for a shorter file, however the stream hands them out.</summary>
    private static ReadOnlySpan<byte> Header(Stream content)
    {
        var buffer = new byte[HeaderLength];
        return buffer.AsSpan(0, content.ReadAtLeast(buffer, HeaderLength, throwOnEndOfStream: false));
    }

    private static bool IsWebp(ReadOnlySpan<byte> header) =>
        header.Length == HeaderLength && header.StartsWith("RIFF"u8) && header[8..].SequenceEqual("WEBP"u8);

    private static bool IsGif(ReadOnlySpan<byte> header) => header.StartsWith("GIF87a"u8) || header.StartsWith("GIF89a"u8);

    private static bool IsTiff(ReadOnlySpan<byte> header) => header.StartsWith(TiffLittleEndian) || header.StartsWith(TiffBigEndian);

    /// <summary>The ISO media file's major brand (<c>ftyp</c> at byte 4, the brand at byte 8), or null.</summary>
    private static string BrandOf(ReadOnlySpan<byte> header) =>
        header.Length == HeaderLength && header[4..].StartsWith("ftyp"u8) ? Encoding.ASCII.GetString(header[8..]) : null;

    /// <summary>
    /// The start must be a ZIP's, because the reader works from the end and would accept an executable with a ZIP appended. Then only the
    /// list of entries is read: nothing is extracted, so a zip bomb costs nothing.
    /// </summary>
    private static bool IsOpenXml(Stream content, string mainEntry)
    {
        if (!Header(content).StartsWith(ZipLocalHeader))
            return false;
        content.Position = 0;
        try
        {
            using var zip = new ZipArchive(content, ZipArchiveMode.Read, leaveOpen: true);
            var names = zip.Entries.Select(entry => entry.FullName).ToList();
            return names.Contains(ContentTypesEntry, StringComparer.OrdinalIgnoreCase)
                   && names.Contains(mainEntry, StringComparer.OrdinalIgnoreCase)
                   && !names.Any(IsVbaProject);
        }
        catch (Exception exception) when (exception is InvalidDataException or IOException or ArgumentException or NotSupportedException or OverflowException)
        {
            // A corrupt ZIP is refused, not an error
            return false;
        }
    }

    private static bool IsVbaProject(string entryName) =>
        entryName.Split('/', '\\')[^1].Equals(VbaProjectEntry, StringComparison.OrdinalIgnoreCase);

    /// <summary>Not "valid UTF-8": Excel on an Arabic Windows PC often saves CSV as Windows-1256 or UTF-16.</summary>
    private static bool IsText(Stream content)
    {
        var buffer = ArrayPool<byte>.Shared.Rent(64 * 1024);
        try
        {
            // The mark needs two bytes in the first block, however the stream hands them out
            var read = content.ReadAtLeast(buffer, Utf16LittleEndianMark.Length, throwOnEndOfStream: false);
            var start = buffer.AsSpan(0, read);
            if (start.StartsWith(Utf16LittleEndianMark) || start.StartsWith(Utf16BigEndianMark))
                return true;

            while (read > 0)
            {
                if (buffer.AsSpan(0, read).ContainsAny(ForbiddenInText))
                    return false;
                read = content.Read(buffer);
            }
            return true;
        }
        finally
        {
            ArrayPool<byte>.Shared.Return(buffer);
        }
    }
}
