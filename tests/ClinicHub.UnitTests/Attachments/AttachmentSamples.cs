using System.Buffers.Binary;
using System.IO.Compression;
using System.Text;

namespace ClinicHub.UnitTests.Attachments;

/// <summary>A signature's shortest passing bytes, and the offsets the design's check reads (a RIFF or <c>ftyp</c> size field is free).</summary>
public sealed record SignatureSample(string Name, string TypeKey, byte[] Bytes, IReadOnlyList<int> CheckedOffsets);

/// <summary>
/// File bytes real enough for the checks of docs/design/attachments.md § 5: signatures, and real ZIPs built with
/// <see cref="System.IO.Compression"/>. <c>AttachmentSamplesTests</c> proves the traps here really are what they claim.
/// </summary>
public static class AttachmentSamples
{
    public const string ArabicText = "مرحبا بالعالم";

    /// <summary>What follows a signature in a sample, so a passing file isn't only its signature.</summary>
    private static readonly byte[] Padding = [.. Enumerable.Range(0, 64).Select(i => (byte)(i + 0x40))];

    private static readonly byte[] CompoundFile = [0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1];

    /// <summary>Every signature of § 5's table, each form of a type with several.</summary>
    public static readonly IReadOnlyList<SignatureSample> Signatures =
    [
        new("png", "png", [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A], Range(0, 8)),
        new("jpeg", "jpeg", [0xFF, 0xD8, 0xFF], Range(0, 3)),
        new("webp", "webp", [.. Ascii("RIFF"), 0x24, 0x00, 0x00, 0x00, .. Ascii("WEBP")], [.. Range(0, 4), .. Range(8, 4)]),
        new("gif87a", "gif", Ascii("GIF87a"), Range(0, 6)),
        new("gif89a", "gif", Ascii("GIF89a"), Range(0, 6)),
        new("bmp", "bmp", Ascii("BM"), Range(0, 2)),
        new("avif", "avif", Ftyp("avif"), Range(4, 8)),
        new("avis", "avif", Ftyp("avis"), Range(4, 8)),
        new("tiff-little-endian", "tiff", [0x49, 0x49, 0x2A, 0x00], Range(0, 4)),
        new("tiff-big-endian", "tiff", [0x4D, 0x4D, 0x00, 0x2A], Range(0, 4)),
        new("heic", "heic", Ftyp("heic"), Range(4, 8)),
        new("heix", "heic", Ftyp("heix"), Range(4, 8)),
        new("hevc", "heic", Ftyp("hevc"), Range(4, 8)),
        new("mif1", "heic", Ftyp("mif1"), Range(4, 8)),
        new("msf1", "heic", Ftyp("msf1"), Range(4, 8)),
        new("pdf", "pdf", Ascii("%PDF-"), Range(0, 5)),
        new("doc", "doc", CompoundFile, Range(0, 8)),
        new("xls", "xls", CompoundFile, Range(0, 8)),
        new("ppt", "ppt", CompoundFile, Range(0, 8)),
    ];

    public static SignatureSample SignatureNamed(string name) => Signatures.Single(s => s.Name == name);

    /// <summary>A file that passes as <paramref name="typeKey"/>.</summary>
    public static byte[] For(string typeKey) => typeKey switch
    {
        "docx" => Docx(),
        "xlsx" => Xlsx(),
        "pptx" => Pptx(),
        "txt" => Encoding.UTF8.GetBytes(ArabicText + "\r\nline two\tend\n"),
        "csv" => Encoding.UTF8.GetBytes("name,dose\r\n" + ArabicText + ",5\r\n"),
        _ => Padded(Signatures.First(s => s.TypeKey == typeKey).Bytes),
    };

    public static byte[] Padded(byte[] signature) => [.. signature, .. Padding];

    public static byte[] Png => For("png");
    public static byte[] Jpeg => For("jpeg");
    public static byte[] Pdf => For("pdf");

    /// <summary>A Windows executable's first bytes: <c>MZ</c>, then the DOS header with its NULs.</summary>
    public static byte[] Executable =>
        [0x4D, 0x5A, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00, 0x04, 0x00, 0x00, 0x00, 0xFF, 0xFF, 0x00, 0x00, 0xB8, 0x00, 0x00, 0x00, .. Padding];

    public static byte[] Docx(params string[] moreEntries) => Zip(["[Content_Types].xml", "word/document.xml", .. moreEntries]);

    public static byte[] Xlsx(params string[] moreEntries) => Zip(["[Content_Types].xml", "xl/workbook.xml", .. moreEntries]);

    public static byte[] Pptx(params string[] moreEntries) => Zip(["[Content_Types].xml", "ppt/presentation.xml", .. moreEntries]);

    /// <summary>A real ZIP holding these entries, each with compressed content.</summary>
    public static byte[] Zip(params string[] entryNames)
    {
        using var bytes = new MemoryStream();
        using (var zip = new ZipArchive(bytes, ZipArchiveMode.Create, leaveOpen: true))
        {
            foreach (var name in entryNames)
            {
                using var writer = new StreamWriter(zip.CreateEntry(name, CompressionLevel.Optimal).Open(), Encoding.UTF8);
                writer.Write(EntryText(name));
            }
        }
        return bytes.ToArray();
    }

    public static string EntryText(string entryName) =>
        string.Concat(Enumerable.Repeat($"<?xml version=\"1.0\"?><part name=\"{entryName}\">content</part>\n", 40));

    /// <summary>The entries' names, read the way a ZIP reader does: from the end of the bytes.</summary>
    public static IReadOnlyList<string> EntryNamesOf(byte[] zip)
    {
        using var reader = new ZipArchive(new MemoryStream(zip), ZipArchiveMode.Read);
        return reader.Entries.Select(e => e.FullName).ToList();
    }

    /// <summary>The ZIP's compressed bytes overwritten, with every header and the entry list untouched.</summary>
    public static byte[] WithCorruptEntryData(byte[] zip)
    {
        byte[] corrupt = [.. zip];
        var directory = DirectoryOf(corrupt);
        foreach (var at in directory.EntryOffsets)
        {
            var compressedSize = BinaryPrimitives.ReadInt32LittleEndian(corrupt.AsSpan(at + 20));
            var header = BinaryPrimitives.ReadInt32LittleEndian(corrupt.AsSpan(at + 42));
            var nameLength = BinaryPrimitives.ReadInt16LittleEndian(corrupt.AsSpan(header + 26));
            var extraLength = BinaryPrimitives.ReadInt16LittleEndian(corrupt.AsSpan(header + 28));
            corrupt.AsSpan(header + 30 + nameLength + extraLength, compressedSize).Fill(0xFF);
        }
        return corrupt;
    }

    /// <summary>
    /// An executable with a ZIP appended, as a self-extracting archive is: the offsets are moved by the executable's length, so a ZIP reader
    /// (which works from the end) really does list the entries. Plain concatenation would be refused as corrupt, proving nothing.
    /// </summary>
    public static byte[] ExecutableWithZipAppended(byte[] zip)
    {
        var prefix = Executable;
        byte[] moved = [.. zip];
        var directory = DirectoryOf(moved);
        foreach (var at in directory.EntryOffsets)
        {
            var header = BinaryPrimitives.ReadInt32LittleEndian(moved.AsSpan(at + 42));
            BinaryPrimitives.WriteInt32LittleEndian(moved.AsSpan(at + 42), header + prefix.Length);
        }
        BinaryPrimitives.WriteInt32LittleEndian(moved.AsSpan(directory.EndRecord + 16), directory.Start + prefix.Length);
        return [.. prefix, .. moved];
    }

    /// <summary>The ZIP with its end-of-central-directory signature destroyed: <c>PK\x03\x04</c> first, no entry list to find.</summary>
    public static byte[] WithBrokenEntryList(byte[] zip)
    {
        byte[] broken = [.. zip];
        broken.AsSpan(DirectoryOf(broken).EndRecord, 4).Fill(0);
        return broken;
    }

    private sealed record ZipDirectory(int EndRecord, int Start, IReadOnlyList<int> EntryOffsets);

    private static ZipDirectory DirectoryOf(byte[] zip)
    {
        var end = zip.AsSpan().LastIndexOf<byte>([0x50, 0x4B, 0x05, 0x06]);
        var count = BinaryPrimitives.ReadInt16LittleEndian(zip.AsSpan(end + 10));
        var start = BinaryPrimitives.ReadInt32LittleEndian(zip.AsSpan(end + 16));
        var offsets = new List<int>();
        var at = start;
        for (var i = 0; i < count; i++)
        {
            offsets.Add(at);
            at += 46
                + BinaryPrimitives.ReadInt16LittleEndian(zip.AsSpan(at + 28))
                + BinaryPrimitives.ReadInt16LittleEndian(zip.AsSpan(at + 30))
                + BinaryPrimitives.ReadInt16LittleEndian(zip.AsSpan(at + 32));
        }
        return new ZipDirectory(end, start, offsets);
    }

    private static byte[] Ascii(string text) => Encoding.ASCII.GetBytes(text);

    private static byte[] Ftyp(string brand) => [0x00, 0x00, 0x00, 0x1C, .. Ascii("ftyp"), .. Ascii(brand)];

    private static int[] Range(int start, int count) => [.. Enumerable.Range(start, count)];
}
