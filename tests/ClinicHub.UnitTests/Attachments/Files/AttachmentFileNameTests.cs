using ClinicHub.Application.Common.Results;
using ClinicHub.Application.Features.Attachments;
using ClinicHub.Application.Features.Attachments.Files;
using ClinicHub.UnitTests.TestSupport;
using Shouldly;

namespace ClinicHub.UnitTests.Attachments.Files;

/// <summary>The file name rules of docs/design/attachments.md § 5, pure and independent of the OS.</summary>
[Trait("Area", "attachments")]
public class AttachmentFileNameTests
{
    [Theory]
    [Trait("Case", "ATT-096")]
    [InlineData("a.png", "a.png")]
    [InlineData("  a.png  ", "a.png")]
    [InlineData("../../a.png", "a.png")]
    [InlineData("..\\..\\a.png", "a.png")]
    [InlineData("C:\\Users\\me\\a.png", "a.png")]
    [InlineData("/etc/a.png", "a.png")]
    [InlineData("folder/ a.png ", "a.png")]
    [InlineData("mixed\\path/a.png", "a.png")]
    [InlineData("folder/", "")]
    [InlineData("folder\\", "")]
    [InlineData("", "")]
    [InlineData(null, "")]
    public void Clean_keeps_the_last_segment_of_either_separator_trimmed(string clientName, string expected)
    {
        AttachmentFileName.Clean(clientName).ShouldBe(expected);
    }

    [Theory]
    [Trait("Case", "ATT-096")]
    [InlineData("")]
    [InlineData("   ")]
    [InlineData(Text.ZeroWidthSpace)]
    [InlineData(Text.ByteOrderMark)]
    public void A_blank_name_checks_as_type_not_allowed(string name)
    {
        AttachmentFileName.Check(name).ShouldBe(AttachmentErrors.TypeNotAllowed);
    }

    [Theory]
    [Trait("Case", "ATT-087")]
    [InlineData("evil\u202Efdp.exe")]
    [InlineData("a\u202Ab.png")]
    [InlineData("a\u202Bb.png")]
    [InlineData("a\u202Cb.png")]
    [InlineData("a\u202Db.png")]
    [InlineData("a\u2066b.png")]
    [InlineData("a\u2067b.png")]
    [InlineData("a\u2068b.png")]
    [InlineData("a\u2069b.png")]
    [InlineData("a\nb.png")]
    [InlineData("a\rb.png")]
    [InlineData("a\tb.png")]
    [InlineData("a\0b.png")]
    [InlineData("a\u0007b.png")]
    [InlineData("a\u007Fb.png")]
    [InlineData("a\u2028b.png")]
    [InlineData("a\u2029b.png")]
    public void A_character_ValidName_refuses_checks_as_name_invalid(string name)
    {
        AttachmentFileName.Check(name).ShouldBe(CommonErrors.NameInvalid);
    }

    [Theory]
    [Trait("Case", "ATT-087")]
    [InlineData("تقرير المريض.pdf")]
    [InlineData("a" + Text.ZeroWidthJoiner + "b.png")]
    [InlineData("a" + Text.ZeroWidthNonJoiner + "b.png")]
    [InlineData("a" + Text.LeftToRightMark + "b.png")]
    [InlineData("a" + Text.RightToLeftMark + "b.png")]
    [InlineData("a" + Text.ArabicLetterMark + "b.png")]
    public void The_characters_ValidName_allows_pass(string name)
    {
        AttachmentFileName.Check(name).ShouldBeNull();
    }

    [Fact]
    [Trait("Case", "ATT-088")]
    public void A_name_of_256_characters_passes_and_257_is_too_long()
    {
        AttachmentFileName.Check(Text.OfLength(256)).ShouldBeNull();
        AttachmentFileName.Check(Text.OfLength(257)).ShouldBe(CommonErrors.NameTooLong);
    }

    [Theory]
    [Trait("Case", "ATT-088")]
    [InlineData("  ")]
    [InlineData("\t")]
    public void The_length_counts_once_trimmed(string around)
    {
        var name = around + Text.OfLength(256) + around;

        AttachmentFileName.Check(AttachmentFileName.Clean(name)).ShouldBeNull();
        AttachmentFileName.Clean(name).Length.ShouldBe(256);
    }

    [Theory]
    [Trait("Case", "ATT-096")]
    [InlineData("a.png", ".png")]
    [InlineData("A.PNG", ".png")]
    [InlineData("a.JpEg", ".jpeg")]
    [InlineData("a.exe.png", ".png")]
    [InlineData("a.png.exe", ".exe")]
    [InlineData("a.exe:.png", ".png")]
    [InlineData("CON.png", ".png")]
    [InlineData("تقرير المريض.PDF", ".pdf")]
    public void The_extension_is_the_last_one_lower_case_with_its_dot(string name, string expected)
    {
        AttachmentFileName.ExtensionOf(name).ShouldBe(expected);
    }

    [Theory]
    [Trait("Case", "ATT-045")]
    [Trait("Case", "ATT-096")]
    [InlineData("report")]
    [InlineData("report.")]
    [InlineData(".png")]
    [InlineData("")]
    public void No_extension_a_trailing_dot_or_only_an_extension_has_none(string name)
    {
        AttachmentFileName.ExtensionOf(name).ShouldBeNull();
    }
}
