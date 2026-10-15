using ClinicHub.Application.Common.Search;
using ClinicHub.UnitTests.TestSupport;
using Shouldly;

namespace ClinicHub.UnitTests.Common.Search;

/// <summary>
/// Arabic-normalized search (tech overview § Conventions, drugs business § البحث): lower case; أ إ آ ٱ and the
/// superscript alef → ا, ى → ي, ة → ه, ؤ → و, ئ → ي; tatweel and diacritics U+064B–U+065F removed. The term is folded
/// like the stored name, so either spelling finds the other.
/// </summary>
[Trait("Area", "catalog")]
public class SearchTextTests
{
    [Theory]
    [InlineData("أسبرين", "اسبرين")]
    [InlineData("إسبرين", "اسبرين")]
    [InlineData("آسبرين", "اسبرين")]
    [InlineData("ٱسبرين", "اسبرين")]
    [InlineData("هٰذا", "هاذا")]
    [InlineData("مستشفى", "مستشفي")]
    [InlineData("قطرة", "قطره")]
    [InlineData("مؤقت", "موقت")]
    [InlineData("هيئة", "هييه")]
    [InlineData("كـــورتيزون", "كورتيزون")]
    [InlineData("مُضَادّ حَيَوِيّ", "مضاد حيوي")]
    public void Each_spelling_folds_to_one(string written, string folded)
    {
        SearchText.Fold(written).ShouldBe(folded);
    }

    [Theory]
    [InlineData("أسبرين ممتد", "اسبرين")]
    [InlineData("اسبرين أطفال", "إسبرين")]
    [InlineData("مستشفى العين", "مستشفي")]
    [InlineData("قطرة عيني", "عينى")]
    [InlineData("قطره مرطبه", "قطرة مرطبة")]
    [InlineData("مُضَادّ حَيَوِيّ", "مضاد حيوي")]
    [InlineData("مضاد حيوي قوي", "مُضَادّ")]
    [InlineData("كـــورتيزون", "كـورتيزون")]
    [InlineData("قطرة Tobradex", "قطره TOBRA")]
    [InlineData("Moxifloxacin 0.5%", "MOXI")]
    public void A_name_is_found_by_any_spelling_of_the_term(string name, string search)
    {
        SearchText.Fold(name).ShouldContain(SearchText.Term(search));
    }

    [Theory]
    [InlineData("Moxifloxacin 0.5%", "moxifloxacin 0.5%")]
    [InlineData("TOBRA_dex", "tobra_dex")]
    [InlineData("Vigamox فيجاموكس", "vigamox فيجاموكس")]
    public void Latin_text_is_only_lower_cased(string name, string folded)
    {
        SearchText.Fold(name).ShouldBe(folded);
    }

    [Fact]
    public void Letters_and_digits_next_to_the_removed_range_stay()
    {
        // U+064A (ي) is just below the diacritics, U+0660 (٠) just above
        SearchText.Fold("ي\u064B\u065F٠").ShouldBe("ي٠");
    }

    [Fact]
    public void The_fold_table_is_the_documented_one()
    {
        // The database column is built from these lists (SearchNameConfiguration): a change needs a migration
        SearchText.Replacements.ShouldBe([
            ('أ', 'ا'), ('إ', 'ا'), ('آ', 'ا'), ('ٱ', 'ا'), ('\u0670', 'ا'),
            ('ى', 'ي'), ('ة', 'ه'), ('ؤ', 'و'), ('ئ', 'ي'),
        ]);
        SearchText.Removed.ShouldBe(
            [(char)0x0640, .. Enumerable.Range(0x064B, 0x065F - 0x064B + 1).Select(c => (char)c)]);
        SearchText.Column.ShouldBe("SearchName");
    }

    [Theory]
    [InlineData("  tobra  ", "tobra")]
    [InlineData("TOBRA", "tobra")]
    [InlineData("to\0bra", "tobra")]
    [InlineData("to\tbra\n", "tobra")]
    [InlineData("  أسبرين ", "اسبرين")]
    [InlineData("50%_x", "50%_x")]
    public void A_term_is_trimmed_lower_cased_cleaned_and_folded(string search, string term)
    {
        SearchText.Term(search).ShouldBe(term);
    }

    [Theory]
    [InlineData(null, null)]
    [InlineData("", "")]
    [InlineData("   ", "")]
    [InlineData("\0", "")]
    [InlineData(Text.Tatweel, "")]
    [InlineData(Text.Shadda + Text.Kasra, "")]
    [InlineData(" " + Text.Tatweel + " " + Text.Tatweel + " ", "")]
    public void A_term_left_empty_means_no_filter(string search, string term)
    {
        SearchText.Term(search).ShouldBe(term);
        string.IsNullOrEmpty(SearchText.Term(search)).ShouldBeTrue();
    }
}
