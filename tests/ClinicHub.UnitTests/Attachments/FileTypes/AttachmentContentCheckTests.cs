using System.Text;
using ClinicHub.Application.Features.Attachments.Files;
using ClinicHub.Application.Features.Attachments.FileTypes;
using Shouldly;

namespace ClinicHub.UnitTests.Attachments.FileTypes;

/// <summary>"The extension picks the type, then the content must prove it" (docs/design/attachments.md § 5).</summary>
[Trait("Area", "attachments")]
public class AttachmentContentCheckTests
{
    private static readonly string[] SignatureTypes = ["png", "jpeg", "webp", "gif", "bmp", "avif", "tiff", "heic", "pdf", "doc", "xls", "ppt"];

    public static TheoryData<string> SignatureNames => [.. AttachmentSamples.Signatures.Select(s => s.Name)];

    public static TheoryData<string, string> EveryFileName => new()
    {
        { "a.png", "png" }, { "A.PNG", "png" },
        { "a.jpg", "jpeg" }, { "a.jpeg", "jpeg" }, { "A.JPG", "jpeg" }, { "A.JPEG", "jpeg" },
        { "a.webp", "webp" }, { "A.WEBP", "webp" },
        { "a.gif", "gif" }, { "A.GIF", "gif" },
        { "a.bmp", "bmp" }, { "A.BMP", "bmp" },
        { "a.avif", "avif" }, { "A.AVIF", "avif" },
        { "a.tif", "tiff" }, { "a.tiff", "tiff" }, { "A.TIF", "tiff" }, { "A.TIFF", "tiff" },
        { "a.heic", "heic" }, { "a.heif", "heic" }, { "A.HEIC", "heic" }, { "A.HEIF", "heic" },
        { "a.pdf", "pdf" }, { "A.PDF", "pdf" },
        { "a.docx", "docx" }, { "A.DOCX", "docx" },
        { "a.xlsx", "xlsx" }, { "A.XLSX", "xlsx" },
        { "a.pptx", "pptx" }, { "A.PPTX", "pptx" },
        { "a.doc", "doc" }, { "A.DOC", "doc" },
        { "a.xls", "xls" }, { "A.XLS", "xls" },
        { "a.ppt", "ppt" }, { "A.PPT", "ppt" },
        { "a.txt", "txt" }, { "A.TXT", "txt" },
        { "a.csv", "csv" }, { "A.CSV", "csv" },
    };

    public static TheoryData<string, string, string> Table => new()
    {
        { "png", ".png", "image/png" },
        { "jpeg", ".jpg .jpeg", "image/jpeg" },
        { "webp", ".webp", "image/webp" },
        { "gif", ".gif", "image/gif" },
        { "bmp", ".bmp", "image/bmp" },
        { "avif", ".avif", "image/avif" },
        { "tiff", ".tif .tiff", "image/tiff" },
        { "heic", ".heic .heif", "image/heic" },
        { "pdf", ".pdf", "application/pdf" },
        { "docx", ".docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document" },
        { "xlsx", ".xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" },
        { "pptx", ".pptx", "application/vnd.openxmlformats-officedocument.presentationml.presentation" },
        { "doc", ".doc", "application/msword" },
        { "xls", ".xls", "application/vnd.ms-excel" },
        { "ppt", ".ppt", "application/vnd.ms-powerpoint" },
        { "txt", ".txt", "text/plain" },
        { "csv", ".csv", "text/csv" },
    };

    /// <summary>What the service does with a file name and its bytes, up to the content check: null when refused, else the type's key.</summary>
    private static string Judge(string fileName, byte[] content)
    {
        var extension = AttachmentFileName.ExtensionOf(AttachmentFileName.Clean(fileName));
        var type = extension is null ? null : AttachmentTypes.FindByExtension(extension);
        return type is not null && Matches(type.Key, content) ? type.Key : null;
    }

    private static bool Matches(string typeKey, byte[] content) =>
        AttachmentContentCheck.Matches(typeKey, new MemoryStream(content));

    /// <summary>A real upload's stream may hand out less than asked: this one, as little as it can.</summary>
    private sealed class OneBytePerRead(byte[] content) : MemoryStream(content)
    {
        public override int Read(byte[] buffer, int offset, int count) => base.Read(buffer, offset, Math.Min(count, 1));

        public override int Read(Span<byte> buffer) => base.Read(buffer[..Math.Min(buffer.Length, 1)]);
    }

    // ---- ATT-040: every type passes ----

    [Fact]
    [Trait("Case", "ATT-040")]
    public void The_known_types_are_the_17_of_the_design_in_its_order()
    {
        AttachmentTypes.All.Select(t => t.Key).ShouldBe(
            ["png", "jpeg", "webp", "gif", "bmp", "avif", "tiff", "heic", "pdf", "docx", "xlsx", "pptx", "doc", "xls", "ppt", "txt", "csv"]);
    }

    [Theory]
    [Trait("Case", "ATT-040")]
    [MemberData(nameof(Table))]
    public void Each_type_has_the_design_tables_extensions_and_content_type(string key, string extensions, string contentType)
    {
        var type = AttachmentTypes.Find(key);

        type.ShouldNotBeNull();
        type.Key.ShouldBe(key);
        type.Extensions.ShouldBe(extensions.Split(' '));
        type.ContentType.ShouldBe(contentType);
        foreach (var extension in type.Extensions) AttachmentTypes.FindByExtension(extension).ShouldBe(type);
    }

    [Fact]
    [Trait("Case", "ATT-040")]
    public void A_type_key_is_found_only_exactly()
    {
        AttachmentTypes.Find("PNG").ShouldBeNull();
        AttachmentTypes.Find("nope").ShouldBeNull();
    }

    [Theory]
    [Trait("Case", "ATT-040")]
    [MemberData(nameof(EveryFileName))]
    public void A_real_sample_with_its_extension_in_any_case_passes_as_its_type(string fileName, string expectedKey)
    {
        Judge(fileName, AttachmentSamples.For(expectedKey)).ShouldBe(expectedKey);
    }

    [Theory]
    [Trait("Case", "ATT-040")]
    [MemberData(nameof(SignatureNames))]
    public void Every_form_of_a_signature_passes_with_what_follows_it_or_alone(string signature)
    {
        var sample = AttachmentSamples.SignatureNamed(signature);

        Matches(sample.TypeKey, AttachmentSamples.Padded(sample.Bytes)).ShouldBeTrue();
        Matches(sample.TypeKey, sample.Bytes).ShouldBeTrue();
    }

    [Theory]
    [Trait("Case", "ATT-040")]
    [MemberData(nameof(SignatureNames))]
    public void Every_form_of_a_signature_passes_from_a_stream_handing_out_one_byte_at_a_time(string signature)
    {
        var sample = AttachmentSamples.SignatureNamed(signature);

        AttachmentContentCheck.Matches(sample.TypeKey, new OneBytePerRead(AttachmentSamples.Padded(sample.Bytes))).ShouldBeTrue();
    }

    [Fact]
    [Trait("Case", "ATT-040")]
    public void The_entry_names_of_a_new_office_file_are_compared_in_any_case()
    {
        Matches("docx", AttachmentSamples.Zip("[CONTENT_TYPES].XML", "WORD/Document.XML")).ShouldBeTrue();
        Matches("xlsx", AttachmentSamples.Zip("[content_types].xml", "XL/WORKBOOK.xml")).ShouldBeTrue();
        Matches("pptx", AttachmentSamples.Zip("[Content_Types].XML", "ppt/PRESENTATION.xml")).ShouldBeTrue();
    }

    // ---- ATT-041, ATT-054: short and wrong signatures ----

    [Theory]
    [Trait("Case", "ATT-041")]
    [MemberData(nameof(SignatureNames))]
    public void A_signature_one_byte_short_fails(string signature)
    {
        var sample = AttachmentSamples.SignatureNamed(signature);

        Matches(sample.TypeKey, sample.Bytes[..^1]).ShouldBeFalse();
    }

    [Theory]
    [Trait("Case", "ATT-041")]
    [MemberData(nameof(SignatureNames))]
    public void A_signature_with_any_one_byte_wrong_fails(string signature)
    {
        var sample = AttachmentSamples.SignatureNamed(signature);

        foreach (var at in sample.CheckedOffsets)
        {
            var wrong = AttachmentSamples.Padded(sample.Bytes);
            wrong[at] ^= 0x01;

            Matches(sample.TypeKey, wrong).ShouldBeFalse($"{signature} with byte {at} wrong");
        }
    }

    [Theory]
    [Trait("Case", "ATT-041")]
    [InlineData("docx")]
    [InlineData("xlsx")]
    [InlineData("pptx")]
    public void A_new_office_file_with_any_byte_of_the_zip_start_wrong_fails(string typeKey)
    {
        for (var at = 0; at < 4; at++)
        {
            var wrong = AttachmentSamples.For(typeKey);
            wrong[at] ^= 0x01;

            // A ZIP reader alone would take it, as it lists from the end: only the file's start tells it apart
            AttachmentSamples.EntryNamesOf(wrong).ShouldNotBeEmpty();
            Matches(typeKey, wrong).ShouldBeFalse($"{typeKey} with byte {at} of its start wrong");
        }
    }

    [Fact]
    [Trait("Case", "ATT-041")]
    public void An_ftyp_box_with_a_brand_of_another_type_fails()
    {
        var avif = AttachmentSamples.SignatureNamed("avif").Bytes;
        var heic = AttachmentSamples.SignatureNamed("heic").Bytes;

        Matches("heic", avif).ShouldBeFalse();
        Matches("avif", heic).ShouldBeFalse();
    }

    [Theory]
    [Trait("Case", "ATT-054")]
    [MemberData(nameof(SignatureNames))]
    public void A_file_shorter_than_a_signature_is_refused_not_an_exception(string signature)
    {
        var sample = AttachmentSamples.SignatureNamed(signature);

        for (var length = 0; length < sample.Bytes.Length; length++)
            Matches(sample.TypeKey, sample.Bytes[..length]).ShouldBeFalse($"{signature} cut to {length} bytes");
    }

    [Theory]
    [Trait("Case", "ATT-054")]
    [InlineData("docx")]
    [InlineData("xlsx")]
    [InlineData("pptx")]
    public void A_file_shorter_than_the_zip_signature_is_refused_not_an_exception(string typeKey)
    {
        byte[] localHeader = [0x50, 0x4B, 0x03, 0x04];

        for (var length = 0; length <= localHeader.Length; length++)
            Matches(typeKey, localHeader[..length]).ShouldBeFalse($"{typeKey} of {length} bytes");
    }

    // ---- ATT-042, ATT-043: the content must prove the extension ----

    [Fact]
    [Trait("Case", "ATT-042")]
    public void A_png_named_jpg_or_a_jpeg_named_png_fails_the_extensions_check()
    {
        Judge("photo.jpg", AttachmentSamples.Png).ShouldBeNull();
        Judge("photo.png", AttachmentSamples.Jpeg).ShouldBeNull();
    }

    [Theory]
    [Trait("Case", "ATT-043")]
    [InlineData("setup.png")]
    [InlineData("setup.pdf")]
    public void An_executable_named_as_an_image_or_a_pdf_fails_the_check(string fileName)
    {
        Judge(fileName, AttachmentSamples.Executable).ShouldBeNull();
    }

    [Theory]
    [Trait("Case", "ATT-045")]
    [InlineData(".svg")]
    [InlineData(".html")]
    [InlineData(".exe")]
    [InlineData(".zip")]
    [InlineData(".docm")]
    [InlineData(".xlsm")]
    public void An_extension_outside_the_table_has_no_type(string extension)
    {
        AttachmentTypes.FindByExtension(extension).ShouldBeNull();
    }

    [Fact]
    [Trait("Case", "ATT-045")]
    public void Asking_for_a_key_the_code_does_not_know_is_a_programmer_error()
    {
        Should.Throw<Exception>(() => Matches("svg", AttachmentSamples.Png)).ShouldNotBeOfType<NotImplementedException>();
    }

    // ---- New Office files ----

    public static TheoryData<string, string> MacroEntriesByType
    {
        get
        {
            var data = new TheoryData<string, string>();
            foreach (var key in new[] { "docx", "xlsx", "pptx" })
                foreach (var entry in new[] { "vbaProject.bin", "word/vbaProject.bin", "xl/vbaProject.bin", "deep/down/here/VBAPROJECT.BIN", "ppt/VbaProject.Bin" })
                    data.Add(key, entry);
            return data;
        }
    }

    [Theory]
    [Trait("Case", "ATT-046")]
    [MemberData(nameof(MacroEntriesByType))]
    public void A_new_office_file_holding_vbaProject_in_any_case_and_folder_is_refused(string typeKey, string macroEntry)
    {
        var withMacros = typeKey switch
        {
            "docx" => AttachmentSamples.Docx(macroEntry),
            "xlsx" => AttachmentSamples.Xlsx(macroEntry),
            _ => AttachmentSamples.Pptx(macroEntry),
        };

        Matches(typeKey, withMacros).ShouldBeFalse();
    }

    [Theory]
    [Trait("Case", "ATT-047")]
    [InlineData("docx")]
    [InlineData("xlsx")]
    [InlineData("pptx")]
    public void A_plain_zip_named_as_a_new_office_file_is_refused(string typeKey)
    {
        Matches(typeKey, AttachmentSamples.Zip("readme.txt", "data/rows.csv")).ShouldBeFalse();
    }

    [Fact]
    [Trait("Case", "ATT-047")]
    public void A_new_office_file_of_another_kind_is_refused()
    {
        Matches("docx", AttachmentSamples.Xlsx()).ShouldBeFalse();
        Matches("docx", AttachmentSamples.Pptx()).ShouldBeFalse();
        Matches("xlsx", AttachmentSamples.Docx()).ShouldBeFalse();
        Matches("xlsx", AttachmentSamples.Pptx()).ShouldBeFalse();
        Matches("pptx", AttachmentSamples.Docx()).ShouldBeFalse();
        Matches("pptx", AttachmentSamples.Xlsx()).ShouldBeFalse();
    }

    [Fact]
    [Trait("Case", "ATT-047")]
    public void A_zip_lacking_the_content_types_entry_is_refused()
    {
        Matches("docx", AttachmentSamples.Zip("word/document.xml")).ShouldBeFalse();
        Matches("xlsx", AttachmentSamples.Zip("xl/workbook.xml")).ShouldBeFalse();
        Matches("pptx", AttachmentSamples.Zip("ppt/presentation.xml")).ShouldBeFalse();
    }

    [Fact]
    [Trait("Case", "ATT-047")]
    public void The_required_entries_must_be_at_their_own_path_not_in_another_folder()
    {
        Matches("docx", AttachmentSamples.Zip("[Content_Types].xml", "other/word/document.xml")).ShouldBeFalse();
        Matches("xlsx", AttachmentSamples.Zip("other/[Content_Types].xml", "xl/workbook.xml")).ShouldBeFalse();
    }

    [Fact]
    [Trait("Case", "ATT-048")]
    public void A_truncated_zip_named_xlsx_is_refused_not_an_exception()
    {
        var xlsx = AttachmentSamples.Xlsx();

        Matches("xlsx", xlsx[..(xlsx.Length / 2)]).ShouldBeFalse();
        Matches("xlsx", xlsx[..^10]).ShouldBeFalse();
    }

    [Fact]
    [Trait("Case", "ATT-048")]
    public void A_corrupt_zip_named_xlsx_is_refused_not_an_exception()
    {
        Matches("xlsx", AttachmentSamples.WithBrokenEntryList(AttachmentSamples.Xlsx())).ShouldBeFalse();

        byte[] headerThenRubbish = [0x50, 0x4B, 0x03, 0x04, .. Enumerable.Repeat((byte)0x7A, 500)];
        Matches("xlsx", headerThenRubbish).ShouldBeFalse();
    }

    [Theory]
    [Trait("Case", "ATT-049")]
    [InlineData("docx")]
    [InlineData("xlsx")]
    [InlineData("pptx")]
    public void A_new_office_file_with_corrupt_compressed_entries_still_passes_as_nothing_is_extracted(string typeKey)
    {
        // AttachmentSamplesTests proves that extracting this entry really fails
        Matches(typeKey, AttachmentSamples.WithCorruptEntryData(AttachmentSamples.For(typeKey))).ShouldBeTrue();
    }

    [Theory]
    [Trait("Case", "ATT-056")]
    [InlineData("docx")]
    [InlineData("xlsx")]
    [InlineData("pptx")]
    public void An_executable_with_a_valid_office_zip_appended_is_refused(string typeKey)
    {
        var trap = AttachmentSamples.ExecutableWithZipAppended(AttachmentSamples.For(typeKey));

        // A ZIP reader alone would take it: only the file's start tells it apart
        AttachmentSamples.EntryNamesOf(trap).ShouldNotBeEmpty();
        Judge($"report.{typeKey}", trap).ShouldBeNull();
    }

    // ---- Old Office files ----

    [Theory]
    [Trait("Case", "ATT-050")]
    [InlineData("a.doc", "doc")]
    [InlineData("a.xls", "xls")]
    [InlineData("a.ppt", "ppt")]
    public void Compound_file_bytes_are_accepted_as_the_type_their_extension_picks(string fileName, string expectedKey)
    {
        Judge(fileName, AttachmentSamples.For("doc")).ShouldBe(expectedKey);
    }

    [Theory]
    [Trait("Case", "ATT-050")]
    [InlineData("a.docx")]
    [InlineData("a.xlsx")]
    [InlineData("a.pptx")]
    public void Compound_file_bytes_named_as_a_new_office_file_are_refused(string fileName)
    {
        Judge(fileName, AttachmentSamples.For("doc")).ShouldBeNull();
    }

    // ---- Text ----

    public static TheoryData<string, byte[]> TextsThatPass
    {
        get
        {
            byte[] utf16LittleEndian = [.. Encoding.Unicode.GetPreamble(), .. Encoding.Unicode.GetBytes("name,dose\r\n" + AttachmentSamples.ArabicText)];
            byte[] utf16BigEndian = [.. Encoding.BigEndianUnicode.GetPreamble(), .. Encoding.BigEndianUnicode.GetBytes("name,dose\r\n" + AttachmentSamples.ArabicText)];
            return new TheoryData<string, byte[]>
            {
                { "UTF-8", Encoding.UTF8.GetBytes("name,dose\r\n" + AttachmentSamples.ArabicText) },
                // "مرحبا" in Windows-1256, as Excel saves it on an Arabic Windows PC: invalid as UTF-8
                { "Windows-1256", [0xE3, 0xD1, 0xCD, 0xC8, 0xC7, 0x2C, 0x35, 0x0D, 0x0A] },
                { "UTF-16 little endian with a mark", utf16LittleEndian },
                { "UTF-16 big endian with a mark", utf16BigEndian },
            };
        }
    }

    [Theory]
    [Trait("Case", "ATT-051")]
    [MemberData(nameof(TextsThatPass))]
    public void Text_in_any_of_the_clinics_encodings_is_accepted_as_txt_and_csv(string encoding, byte[] content)
    {
        Judge("a.txt", content).ShouldBe("txt", encoding);
        Judge("a.csv", content).ShouldBe("csv", encoding);
    }

    [Theory]
    [Trait("Case", "ATT-051")]
    [MemberData(nameof(TextsThatPass))]
    public void Text_from_a_stream_handing_out_one_byte_at_a_time_is_accepted(string encoding, byte[] content)
    {
        AttachmentContentCheck.Matches("txt", new OneBytePerRead(content)).ShouldBeTrue(encoding);
        AttachmentContentCheck.Matches("csv", new OneBytePerRead(content)).ShouldBeTrue(encoding);
    }

    [Theory]
    [Trait("Case", "ATT-051")]
    [InlineData("txt", 0x61)]
    [InlineData("csv", 0x61)]
    [InlineData("txt", 0xFF)]
    [InlineData("txt", 0x0A)]
    public void A_one_byte_text_file_is_accepted_not_an_exception(string typeKey, byte only)
    {
        Matches(typeKey, [only]).ShouldBeTrue();
        AttachmentContentCheck.Matches(typeKey, new OneBytePerRead([only])).ShouldBeTrue();
    }

    [Fact]
    [Trait("Case", "ATT-052")]
    public void A_one_byte_text_file_holding_a_control_character_is_refused_and_so_is_one_handed_out_a_byte_at_a_time()
    {
        Matches("txt", [0x00]).ShouldBeFalse();
        AttachmentContentCheck.Matches("txt", new OneBytePerRead([0x61, 0x62, 0x00])).ShouldBeFalse();
    }

    [Fact]
    [Trait("Case", "ATT-052")]
    public void Every_c0_control_character_is_refused_except_tab_cr_lf_and_form_feed()
    {
        for (var code = 0; code < 0x20; code++)
        {
            byte[] content = [0x61, 0x62, (byte)code, 0x63];
            var allowed = code is 0x09 or 0x0A or 0x0C or 0x0D;

            Matches("txt", content).ShouldBe(allowed, $"U+{code:X4} in a .txt");
            Matches("csv", content).ShouldBe(allowed, $"U+{code:X4} in a .csv");
        }
    }

    [Fact]
    [Trait("Case", "ATT-052")]
    public void Executable_bytes_named_txt_are_refused()
    {
        Judge("notes.txt", AttachmentSamples.Executable).ShouldBeNull();
    }

    [Fact]
    [Trait("Case", "ATT-053")]
    public void A_txt_starting_with_BM_is_accepted_as_the_extension_picks_the_type()
    {
        Judge("notes.txt", Encoding.ASCII.GetBytes("BM is how this note starts")).ShouldBe("txt");
    }

    [Theory]
    [Trait("Case", "ATT-057")]
    [InlineData(1_048_576)]
    [InlineData(3 * 1_048_576 + 17)]
    public void A_txt_whose_last_byte_is_NUL_past_the_first_megabyte_is_refused(int textBytes)
    {
        var clean = new byte[textBytes];
        Array.Fill(clean, (byte)0x61);
        byte[] withNul = [.. clean, 0x00];

        Matches("txt", clean).ShouldBeTrue();
        Matches("txt", withNul).ShouldBeFalse();
    }

    [Fact]
    public void The_signature_types_all_have_a_sample()
    {
        AttachmentSamples.Signatures.Select(s => s.TypeKey).Distinct().ShouldBe(SignatureTypes, ignoreOrder: true);
    }
}
