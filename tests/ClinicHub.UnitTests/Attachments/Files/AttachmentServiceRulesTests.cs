using System.Text;
using System.Text.RegularExpressions;
using ClinicHub.Application.Common.Settings;
using ClinicHub.Application.Features.Attachments.Files;
using Shouldly;
using static ClinicHub.UnitTests.Attachments.Files.AttachmentServiceHarness;

namespace ClinicHub.UnitTests.Attachments.Files;

/// <summary>
/// The service's rules, first failure answers: empty → size → file name → extension known and allowed → content (docs/design/attachments.md § 5).
/// A refusal reaches neither the database nor the provider.
/// </summary>
[Trait("Area", "attachments")]
public partial class AttachmentServiceRulesTests
{
    private const string TypeNotAllowed = "attachmentTypeNotAllowed";
    private const string TooLarge = "attachmentTooLarge";
    private const string Empty = "attachmentEmpty";
    private const string NameInvalid = "nameInvalid";
    private const string NameTooLong = "nameTooLong";

    private readonly AttachmentServiceHarness harness = new();

    private static byte[] BytesOf(int length)
    {
        var bytes = new byte[length];
        Array.Fill(bytes, (byte)0x61);
        return bytes;
    }

    private static byte[] Oversized(AttachmentOwner owner) =>
        BytesOf((owner == M ? 2 : 20) * (int)AttachmentSettings.BytesPerMb + 1);

    // ---- Accepted: the rules let it through to the write ----

    [Theory]
    [Trait("Case", "ATT-040")]
    [InlineData("a.png", "png")]
    [InlineData("A.PNG", "png")]
    [InlineData("a.jpeg", "jpeg")]
    [InlineData("a.WEBP", "webp")]
    [InlineData("a.gif", "gif")]
    [InlineData("a.bmp", "bmp")]
    [InlineData("a.avif", "avif")]
    [InlineData("a.TIF", "tiff")]
    [InlineData("a.heif", "heic")]
    [InlineData("a.pdf", "pdf")]
    [InlineData("a.docx", "docx")]
    [InlineData("A.XLSX", "xlsx")]
    [InlineData("a.pptx", "pptx")]
    [InlineData("a.doc", "doc")]
    [InlineData("a.xls", "xls")]
    [InlineData("a.ppt", "ppt")]
    [InlineData("a.txt", "txt")]
    [InlineData("a.csv", "csv")]
    public async Task A_real_sample_passes_every_rule_in_a_module_with_the_global_list(string fileName, string typeKey)
    {
        await harness.ShouldReachTheWrite(G, Upload(fileName, AttachmentSamples.For(typeKey)));
    }

    // ---- ATT-042, ATT-043: the content must prove the extension ----

    [Theory]
    [Trait("Case", "ATT-042")]
    [InlineData("photo.jpg", "png")]
    [InlineData("photo.png", "jpeg")]
    public async Task A_file_whose_content_is_another_image_type_is_refused_and_nothing_is_written(string fileName, string actualType)
    {
        await harness.ShouldRefuse(M, Upload(fileName, AttachmentSamples.For(actualType)), TypeNotAllowed);
        await harness.ShouldRefuse(G, Upload(fileName, AttachmentSamples.For(actualType)), TypeNotAllowed);
    }

    [Theory]
    [Trait("Case", "ATT-043")]
    [InlineData("setup.png")]
    [InlineData("setup.pdf")]
    public async Task An_executable_named_as_an_allowed_type_is_refused_and_nothing_is_written(string fileName)
    {
        await harness.ShouldRefuse(G, Upload(fileName, AttachmentSamples.Executable), TypeNotAllowed);
    }

    [Theory]
    [Trait("Case", "ATT-045")]
    [InlineData("drawing.svg")]
    [InlineData("page.html")]
    [InlineData("setup.exe")]
    [InlineData("files.zip")]
    [InlineData("report.docm")]
    [InlineData("report.xlsm")]
    [InlineData("report")]
    [InlineData("report.")]
    public async Task A_type_outside_the_table_or_a_name_with_no_extension_is_refused(string fileName)
    {
        await harness.ShouldRefuse(G, Upload(fileName, AttachmentSamples.Docx()), TypeNotAllowed);
    }

    [Fact]
    [Trait("Case", "ATT-045")]
    public async Task A_macro_extension_is_refused_even_with_clean_office_content()
    {
        await harness.ShouldRefuse(G, Upload("clean.xlsm", AttachmentSamples.Xlsx()), TypeNotAllowed);
    }

    // ---- ATT-066: an empty list accepts nothing ----

    [Fact]
    [Trait("Case", "ATT-066")]
    public async Task An_empty_global_list_refuses_every_upload_in_a_module_with_no_entry()
    {
        harness.Settings.AllowedTypes = "";

        await harness.ShouldRefuse(G, Upload("a.png", AttachmentSamples.Png), TypeNotAllowed);
    }

    [Fact]
    [Trait("Case", "ATT-066")]
    public async Task An_empty_module_list_refuses_every_upload_in_that_module()
    {
        harness.Settings.Modules[AttachmentModules.ClinicPaper] = new AttachmentModuleSettings { AllowedTypes = "" };

        await harness.ShouldRefuse(M, Upload("a.png", AttachmentSamples.Png), TypeNotAllowed);
    }

    // ---- ATT-067 ----

    [Fact]
    [Trait("Case", "ATT-067")]
    public async Task Type_keys_with_spaces_or_another_case_still_decide_what_passes()
    {
        harness.Settings.Modules[AttachmentModules.ClinicPaper] = new AttachmentModuleSettings { AllowedTypes = " PNG , jpeg " };

        await harness.ShouldRefuse(M, Upload("a.pdf", AttachmentSamples.Pdf), TypeNotAllowed);
        await harness.ShouldReachTheWrite(M, Upload("a.png", AttachmentSamples.Png));
    }

    // ---- ATT-074 ----

    [Fact]
    [Trait("Case", "ATT-074")]
    public async Task With_1_mb_in_config_a_file_of_1048576_bytes_passes_and_one_byte_more_is_too_large()
    {
        harness.Settings.MaxFileSizeMb = 1;

        await harness.ShouldRefuse(G, Upload("a.txt", BytesOf(1_048_577)), TooLarge);
        await harness.ShouldReachTheWrite(G, Upload("a.txt", BytesOf(1_048_576)));
    }

    // ---- ATT-087, ATT-088: the name ----

    [Theory]
    [Trait("Case", "ATT-087")]
    [InlineData("evil\u202Efdp.exe")]
    [InlineData("a\u202Ab.png")]
    [InlineData("a\u2066b.png")]
    [InlineData("a\u2069b.png")]
    [InlineData("a\nb.png")]
    [InlineData("a\rb.png")]
    [InlineData("a\tb.png")]
    [InlineData("a\0b.png")]
    [InlineData("a\u0007b.png")]
    [InlineData("a\u2028b.png")]
    [InlineData("a\u2029b.png")]
    public async Task A_name_with_a_control_character_a_line_break_or_a_bidi_control_answers_nameInvalid(string fileName)
    {
        await harness.ShouldRefuse(G, Upload(fileName, AttachmentSamples.Png), NameInvalid);
    }

    [Fact]
    [Trait("Case", "ATT-088")]
    public async Task A_name_of_256_characters_passes_and_257_answers_nameTooLong()
    {
        await harness.ShouldRefuse(G, Upload(new string('ب', 253) + ".png", AttachmentSamples.Png), NameTooLong);
        await harness.ShouldReachTheWrite(G, Upload(new string('ب', 252) + ".png", AttachmentSamples.Png));
    }

    // ---- ATT-092: first failure answers ----

    [Fact]
    [Trait("Case", "ATT-092")]
    public async Task An_empty_exe_answers_empty_before_its_type()
    {
        await harness.ShouldRefuse(G, Upload("setup.exe", []), Empty);
    }

    [Fact]
    [Trait("Case", "ATT-092")]
    public async Task An_empty_upload_with_no_name_answers_empty_before_its_name()
    {
        await harness.ShouldRefuse(G, new AttachmentUpload("", () => Stream.Null), Empty);
        await harness.ShouldRefuse(G, Upload("a\0b.png", []), Empty);
    }

    [Theory]
    [Trait("Case", "ATT-092")]
    [InlineData("bad\u202Ename.png")]
    [InlineData("setup.exe")]
    public async Task An_oversized_file_answers_too_large_before_its_name_or_type(string fileName)
    {
        await harness.ShouldRefuse(M, Upload(fileName, Oversized(M)), TooLarge);
    }

    [Fact]
    [Trait("Case", "ATT-092")]
    public async Task A_bad_name_on_an_exe_answers_the_name_before_the_type()
    {
        await harness.ShouldRefuse(G, Upload("bad\u202Ename.exe", AttachmentSamples.Executable), NameInvalid);
        await harness.ShouldRefuse(G, Upload(new string('a', 253) + ".exe", AttachmentSamples.Executable), NameTooLong);
    }

    [Fact]
    [Trait("Case", "ATT-092")]
    public async Task An_extension_not_allowed_for_the_module_answers_without_needing_the_content_to_match()
    {
        await harness.ShouldRefuse(M, Upload("a.pdf", AttachmentSamples.Pdf), TypeNotAllowed);
    }

    [Fact]
    [Trait("Case", "ATT-092")]
    public async Task The_limit_of_the_module_decides_too_large_and_not_the_global_one()
    {
        var overM = BytesOf(2 * (int)AttachmentSettings.BytesPerMb + 1);

        await harness.ShouldRefuse(M, Upload("a.png", overM), TooLarge);
        await harness.ShouldRefuse(G, Upload("a.txt", Oversized(G)), TooLarge);
        await harness.ShouldReachTheWrite(G, Upload("a.txt", overM));
    }

    // ---- ATT-096: odd names ----

    [Theory]
    [Trait("Case", "ATT-096")]
    [InlineData("")]
    [InlineData("   ")]
    [InlineData("\u200B")]
    [InlineData(null)]
    [InlineData("folder/")]
    [InlineData("folder\\")]
    [InlineData(".png")]
    [InlineData("folder/.png")]
    public async Task A_blank_name_a_name_ending_in_a_slash_or_only_an_extension_is_refused_as_a_type(string fileName)
    {
        await harness.ShouldRefuse(G, Upload(fileName, AttachmentSamples.Png), TypeNotAllowed);
    }

    [Theory]
    [Trait("Case", "ATT-096")]
    [InlineData("CON.png")]
    [InlineData("a.exe.png")]
    [InlineData("a.exe:.png")]
    [InlineData("..\\..\\x.png")]
    public async Task An_odd_name_is_judged_by_its_last_extension_and_never_reaches_the_key(string fileName)
    {
        var key = await harness.ShouldReachTheWrite(G, Upload(fileName, AttachmentSamples.Png));

        ClinicKey().IsMatch(key).ShouldBeTrue($"the key is the clinic and a GUID, whatever the name: {key}");
    }

    [Theory]
    [Trait("Case", "ATT-096")]
    [InlineData("CON.png")]
    [InlineData("a.exe.png")]
    [InlineData("a.exe:.png")]
    public async Task An_executable_with_such_a_name_fails_the_check_of_the_last_extension(string fileName)
    {
        await harness.ShouldRefuse(G, Upload(fileName, AttachmentSamples.Executable), TypeNotAllowed);
    }

    [Fact]
    [Trait("Case", "ATT-096")]
    public async Task A_name_of_256_arabic_characters_passes_the_rules()
    {
        await harness.ShouldReachTheWrite(G, Upload(new string('م', 252) + ".pdf", AttachmentSamples.Pdf));
    }

    [Fact]
    [Trait("Case", "ATT-053")]
    public async Task A_txt_starting_with_BM_passes_the_rules()
    {
        await harness.ShouldReachTheWrite(G, Upload("notes.txt", Encoding.ASCII.GetBytes("BM is how this note starts")));
    }

    [GeneratedRegex("^clinics/7/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")]
    private static partial Regex ClinicKey();
}
