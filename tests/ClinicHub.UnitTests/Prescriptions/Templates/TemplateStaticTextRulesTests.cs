using ClinicHub.Application.Features.Prescriptions.Templates;
using ClinicHub.Application.Features.Prescriptions.Templates.Commands.SavePrescriptionTemplate;
using Shouldly;
using static ClinicHub.UnitTests.Prescriptions.Templates.TemplateLayouts;

namespace ClinicHub.UnitTests.Prescriptions.Templates;

/// <summary>Contract § 1.4 rules 8f–8h: a static text is required, keeps its line breaks and counts as typed.</summary>
[Trait("Area", "admin")]
public class TemplateStaticTextRulesTests
{
    private static PrescriptionLayoutDto WithText(string text) => OnA5(PrescriptionText(), StaticItem(text));

    private static string KeptText(string text) => SavePrescriptionTemplateCommand.From(WithText(text)).Items[1].Text;

    // ---- 8f: required ----

    [Theory]
    [Trait("Case", "TPL-030")]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   ")]
    [InlineData("\n")]
    [InlineData(" \r\n\t ")]
    [InlineData("\u200B")]
    [InlineData(" \uFEFF ")]
    public void Empty_only_spaces_or_invisible_characters_is_templateStaticTextRequired(string text)
    {
        ShouldFail(WithText(text), ("items[1].text", "templateStaticTextRequired"));
    }

    // ---- 8g: refused characters ----

    [Theory]
    [Trait("Case", "TPL-032")]
    [InlineData(0x0000)]
    [InlineData(0x0007)]
    [InlineData(0x001B)]
    [InlineData(0x0085)]
    [InlineData(0x2028)]
    [InlineData(0x2029)]
    [InlineData(0x202A)]
    [InlineData(0x202B)]
    [InlineData(0x202C)]
    [InlineData(0x202D)]
    [InlineData(0x202E)]
    [InlineData(0x2066)]
    [InlineData(0x2067)]
    [InlineData(0x2068)]
    [InlineData(0x2069)]
    public void A_control_character_a_line_separator_or_a_bidi_control_is_invalidText(int code)
    {
        ShouldFail(WithText($"نص{(char)code}آخر"), ("items[1].text", "invalidText"));
    }

    [Theory]
    [Trait("Case", "TPL-032")]
    [InlineData(0x200E)]
    [InlineData(0x200F)]
    [InlineData(0x061C)]
    [InlineData(0x200C)]
    [InlineData(0x200D)]
    public void Marks_and_joiners_pass(int code)
    {
        ShouldPass(WithText($"نص{(char)code}آخر"));
    }

    [Theory]
    [Trait("Case", "TPL-212")]
    [InlineData("سطر\nسطر")]
    [InlineData("سطر\rسطر")]
    [InlineData("سطر\r\nسطر")]
    [InlineData("سطر\tسطر")]
    [InlineData("\nسطر\n")]
    public void Line_breaks_and_tabs_pass_and_are_kept(string text)
    {
        ShouldPass(WithText(text));
        KeptText(text).ShouldBe(text);
    }

    [Fact]
    [Trait("Case", "TPL-030")]
    public void The_text_is_kept_as_typed_spaces_included()
    {
        KeptText("  نص  ").ShouldBe("  نص  ");
    }

    // ---- 8h: length as typed ----

    [Fact]
    [Trait("Case", "TPL-030")]
    public void A_text_of_1000_passes_and_1001_is_templateStaticTextTooLong()
    {
        ShouldPass(WithText(new string('ن', 1000)));
        ShouldFail(WithText(new string('ن', 1001)), ("items[1].text", "templateStaticTextTooLong"));
    }

    [Fact]
    [Trait("Case", "TPL-212")]
    public void A_pasted_line_break_counts_as_two_characters()
    {
        ShouldPass(WithText(new string('ن', 998) + "\r\n"));
        ShouldFail(WithText(new string('ن', 999) + "\r\n"), ("items[1].text", "templateStaticTextTooLong"));
    }

    [Fact]
    [Trait("Case", "TPL-030")]
    public void Spaces_around_the_text_count_since_it_is_not_trimmed()
    {
        ShouldPass(WithText(" " + new string('ن', 998) + " "));
        ShouldFail(WithText(" " + new string('ن', 1000)), ("items[1].text", "templateStaticTextTooLong"));
    }

    [Fact]
    [Trait("Case", "TPL-032")]
    public void A_refused_character_comes_before_the_length()
    {
        ShouldFail(WithText(new string('ن', 1000) + "\u202E"),
            ("items[1].text", "invalidText"),
            ("items[1].text", "templateStaticTextTooLong"));
    }

    [Fact]
    [Trait("Case", "TPL-030")]
    public void A_static_text_needs_no_name()
    {
        ShouldPass(OnA5(PrescriptionText(), StaticItem("نص") with { Name = null }));
    }
}
