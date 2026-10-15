using ClinicHub.Application.Common.Validation;
using ClinicHub.Domain.Common;
using ClinicHub.UnitTests.TestSupport;
using FluentValidation;
using Shouldly;

namespace ClinicHub.UnitTests.Common.Validation;

/// <summary>
/// The shared name rule <c>ValidName</c> (drugs tech § Backend, platform-admin business § rules, tech overview
/// § Conventions): required (spaces and invisible format characters count as blank), no control characters, line or
/// paragraph separators, bidi overrides or isolates, at most the column's limit once trimmed.
/// </summary>
[Trait("Area", "catalog")]
public class ValidNameTests
{
    public sealed record Named(string Name);

    private sealed class DefaultLimit : AbstractValidator<Named>
    {
        public DefaultLimit() => RuleFor(x => x.Name).ValidName();
    }

    private sealed class RoleLimit : AbstractValidator<Named>
    {
        public RoleLimit() => RuleFor(x => x.Name).ValidName(FieldLimits.RoleNameMaxLength);
    }

    private static string[] Codes(string name, bool role = false)
    {
        var answer = role ? ApiValidation.Run(new RoleLimit(), new Named(name)) : ApiValidation.Run(new DefaultLimit(), new Named(name));
        answer.Errors.ShouldAllBe(e => e.Field == "name");
        return answer.Errors.Select(e => e.Code).ToArray();
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   ")]
    [InlineData("\t\n ")]
    [InlineData(Text.ZeroWidthSpace)]
    [InlineData(" " + Text.ZeroWidthSpace + " " + Text.WordJoiner + Text.ByteOrderMark)]
    [InlineData(Text.RightToLeftMark + Text.LeftToRightMark)]
    public void Blank_names_are_required(string name)
    {
        Codes(name).ShouldBe(["nameRequired"]);
    }

    [Theory]
    [InlineData("Tobradex")]
    [InlineData("قطرة مرطبة")]
    [InlineData("Vigamox فيجاموكس")]
    [InlineData("Eye drops 👁️")]
    [InlineData("  Tobradex  ")]
    [InlineData("Tobradex\n")]
    [InlineData("\tTobradex")]
    [InlineData("لا" + Text.ZeroWidthJoiner + "م")]
    [InlineData("قطرة" + Text.ZeroWidthNonJoiner + "عين")]
    [InlineData(Text.LeftToRightMark + "Tobradex" + Text.RightToLeftMark)]
    [InlineData("قطرة" + Text.ArabicLetterMark + " عين")]
    public void Names_as_typed_or_pasted_are_valid(string name)
    {
        Codes(name).ShouldBeEmpty();
    }

    [Theory]
    [InlineData("a\0b")]
    [InlineData("Two\nlines")]
    [InlineData("Two\r\nlines")]
    [InlineData("a\tb")]
    [InlineData("a\u0007b")]
    [InlineData("a\u007Fb")]
    [InlineData("a\u0085b")]
    [InlineData("a\u2028b")]
    [InlineData("a\u2029b")]
    public void Control_characters_and_line_separators_inside_are_invalid(string name)
    {
        Codes(name).ShouldBe(["nameInvalid"]);
    }

    [Theory]
    [InlineData('\u202A')]
    [InlineData('\u202B')]
    [InlineData('\u202C')]
    [InlineData('\u202D')]
    [InlineData('\u202E')]
    [InlineData('\u2066')]
    [InlineData('\u2067')]
    [InlineData('\u2068')]
    [InlineData('\u2069')]
    public void Bidi_overrides_and_isolates_are_invalid(char bidi)
    {
        Codes($"Tobra{bidi}dex").ShouldBe(["nameInvalid"]);
        Codes($"{bidi}Tobradex").ShouldBe(["nameInvalid"], "at the start");
    }

    [Theory]
    [InlineData('‧')] // hyphenation point, just below the line separator U+2028
    [InlineData(' ')] // narrow no-break space, just above the overrides U+202A-U+202E
    [InlineData('⁥')] // just below the isolates U+2066-U+2069
    [InlineData('\u206A')] // just above them
    public void Characters_next_to_the_refused_ranges_are_valid(char c)
    {
        Codes($"a{c}b").ShouldBeEmpty();
    }

    [Theory]
    [InlineData(1, true)]
    [InlineData(255, true)]
    [InlineData(256, true)]
    [InlineData(257, false)]
    public void Names_are_at_most_256_characters(int length, bool valid)
    {
        Codes(Text.OfLength(length)).ShouldBe(valid ? [] : ["nameTooLong"]);
    }

    [Fact]
    public void The_limit_applies_after_trimming()
    {
        Codes("  " + Text.OfLength(256) + "  ").ShouldBeEmpty();
        Codes("  " + Text.OfLength(257) + "  ").ShouldBe(["nameTooLong"]);
    }

    [Theory]
    [InlineData(100, true)]
    [InlineData(101, false)]
    public void Role_names_are_at_most_100_characters(int length, bool valid)
    {
        Codes(Text.OfLength(length), role: true).ShouldBe(valid ? [] : ["nameTooLong"]);
    }

    [Fact]
    public void A_long_name_with_a_NUL_reports_both_in_order()
    {
        Codes(Text.OfLength(256) + "\0").ShouldBe(["nameInvalid", "nameTooLong"]);
    }

    [Fact]
    public void The_limits_are_the_columns()
    {
        FieldLimits.NameMaxLength.ShouldBe(256);
        FieldLimits.RoleNameMaxLength.ShouldBe(100);
    }
}
