using System.IO.Compression;
using Shouldly;

namespace ClinicHub.UnitTests.Attachments;

/// <summary>The samples are what the cases need them to be: a trap that a reader wouldn't fall for proves nothing.</summary>
[Trait("Area", "attachments")]
public class AttachmentSamplesTests
{
    [Fact]
    public void A_sample_zip_starts_with_the_local_header_and_lists_its_entries()
    {
        var docx = AttachmentSamples.Docx("word/vbaProject.bin");

        docx[..4].ShouldBe(new byte[] { 0x50, 0x4B, 0x03, 0x04 });
        AttachmentSamples.EntryNamesOf(docx).ShouldBe(["[Content_Types].xml", "word/document.xml", "word/vbaProject.bin"]);
    }

    [Fact]
    public void The_corrupted_zip_still_lists_its_entries_but_a_real_extraction_fails()
    {
        var corrupt = AttachmentSamples.WithCorruptEntryData(AttachmentSamples.Docx());

        AttachmentSamples.EntryNamesOf(corrupt).ShouldBe(["[Content_Types].xml", "word/document.xml"]);
        ExtractedTextOrNull(corrupt, "word/document.xml").ShouldNotBe(AttachmentSamples.EntryText("word/document.xml"));
        ExtractedTextOrNull(AttachmentSamples.Docx(), "word/document.xml").ShouldBe(AttachmentSamples.EntryText("word/document.xml"));
    }

    [Fact]
    public void An_executable_with_a_zip_appended_starts_with_MZ_and_a_zip_reader_lists_it_and_extracts_it()
    {
        var trap = AttachmentSamples.ExecutableWithZipAppended(AttachmentSamples.Docx());

        trap[..2].ShouldBe(new byte[] { 0x4D, 0x5A });
        AttachmentSamples.EntryNamesOf(trap).ShouldBe(["[Content_Types].xml", "word/document.xml"]);
        ExtractedTextOrNull(trap, "word/document.xml").ShouldBe(AttachmentSamples.EntryText("word/document.xml"));
    }

    [Fact]
    public void A_broken_entry_list_keeps_the_local_header_but_a_zip_reader_refuses_it()
    {
        var broken = AttachmentSamples.WithBrokenEntryList(AttachmentSamples.Xlsx());

        broken[..4].ShouldBe(new byte[] { 0x50, 0x4B, 0x03, 0x04 });
        Should.Throw<InvalidDataException>(() => AttachmentSamples.EntryNamesOf(broken));
    }

    private static string ExtractedTextOrNull(byte[] zip, string entryName)
    {
        try
        {
            using var reader = new ZipArchive(new MemoryStream(zip), ZipArchiveMode.Read);
            using var text = new StreamReader(reader.GetEntry(entryName)!.Open());
            return text.ReadToEnd();
        }
        catch (InvalidDataException)
        {
            return null;
        }
    }
}
