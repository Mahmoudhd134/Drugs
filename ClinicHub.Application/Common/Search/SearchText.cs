using System.Text;
// The Paging class: its folder has the same name (architecture § 3.7)
using PagingRules = ClinicHub.Application.Common.Paging.Paging;

namespace ClinicHub.Application.Common.Search;

/// <summary>
/// Arabic-normalized search (M1.6.1, Q6; M1.7 D7). The searched tables (drugs, protocols, clinics, staff) have an
/// ordinary column <see cref="Column"/> (and drugs also <see cref="OtherColumn"/>), an EF shadow property filled by the
/// save interceptor with <see cref="Fold"/> of the row's source text whenever the row is added or that text changes.
/// A search term is folded here the same way (<see cref="Term"/>, <see cref="OtherTerm"/>), so «اسبرين» finds «أسبرين»
/// and back: one fold function on both sides, no database-specific SQL. Changing the table needs a data migration that
/// refolds the stored rows (and the same change in <c>data/drug-catalog/tools/load_catalog.py</c>).
/// </summary>
public static class SearchText
{
    /// <summary>The column (an EF shadow property) holding the folded name; read with <c>EF.Property</c>.</summary>
    public const string Column = "SearchName";

    /// <summary>
    /// <c>Drugs</c> only: the folded hidden Arabic name and active ingredients (<see cref="OtherText"/>), compared with
    /// <see cref="OtherTerm"/>; read with <c>EF.Property</c>.
    /// </summary>
    public const string OtherColumn = "SearchOther";

    /// <summary>
    /// Letters written in several ways, mapped to one: the hamza and madda alef forms أ إ آ and the wasla alef ٱ → ا;
    /// alef maksura ى → ي; teh marbuta ة → ه; the hamza seats ؤ → و and ئ → ي; the superscript (dagger) alef U+0670 → ا
    /// (it stands for an alef, as in the role-name rule of <c>RoleRules.WithoutInvisibleMarks</c>).
    /// </summary>
    public static readonly IReadOnlyList<(char From, char To)> Replacements =
    [
        ('أ', 'ا'), // أ → ا
        ('إ', 'ا'), // إ → ا
        ('آ', 'ا'), // آ → ا
        ('ٱ', 'ا'), // ٱ → ا
        ('ٰ', 'ا'), // superscript alef → ا
        ('ى', 'ي'), // ى → ي
        ('ة', 'ه'), // ة → ه
        ('ؤ', 'و'), // ؤ → و
        ('ئ', 'ي'), // ئ → ي
    ];

    /// <summary>Characters dropped: the tatweel U+0640 and the Arabic diacritics (tashkeel) U+064B–U+065F.</summary>
    public static readonly IReadOnlyList<char> Removed =
        [(char)0x0640, .. Enumerable.Range(0x064B, 0x065F - 0x064B + 1).Select(c => (char)c)];

    private static readonly Dictionary<char, char> ReplacementMap = Replacements.ToDictionary(r => r.From, r => r.To);
    private static readonly HashSet<char> RemovedSet = [.. Removed];

    /// <summary>
    /// A list's search term: <see cref="PagingRules.SearchTerm"/> (trimmed, lower case, control characters removed), then
    /// <see cref="Fold"/>ed. Null or empty (also a term made only of tatweel or diacritics) means no filter.
    /// </summary>
    public static string Term(string search)
    {
        var term = PagingRules.SearchTerm(search);
        return string.IsNullOrEmpty(term) ? term : Fold(term).Trim();
    }

    /// <summary>
    /// <paramref name="text"/> lower-cased (invariant) with <see cref="Replacements"/> applied and <see cref="Removed"/>
    /// dropped: what the database stores in <see cref="Column"/> for a name.
    /// </summary>
    public static string Fold(string text)
    {
        var folded = new StringBuilder(text.Length);
        foreach (var c in text.ToLowerInvariant())
        {
            if (RemovedSet.Contains(c))
                continue;
            folded.Append(ReplacementMap.GetValueOrDefault(c, c));
        }

        return folded.ToString();
    }

    /// <summary>
    /// What <see cref="OtherColumn"/> stores for a drug (D7): <paramref name="nameAr"/> and
    /// <paramref name="activeIngredients"/> joined by one space (a null as empty), every <c>+</c> and <c>(</c> replaced
    /// by a space, then <see cref="Fold"/>ed. Never null (one space when both are null, as the load script computes it).
    /// </summary>
    public static string OtherText(string nameAr, string activeIngredients) =>
        Fold(SplitMarks($"{nameAr} {activeIngredients}"));

    /// <summary>
    /// A search term for <see cref="OtherColumn"/>: <see cref="Term"/> with the same <c>+</c> / <c>(</c> → space
    /// replacement as <see cref="OtherText"/>, so a pasted "DEXAMETHASONE+TOBRAMYCIN" finds the drugs holding it. Null or
    /// empty = no filter.
    /// </summary>
    public static string OtherTerm(string search)
    {
        var term = Term(search);
        return string.IsNullOrEmpty(term) ? term : SplitMarks(term);
    }

    /// <summary>The separators of the source's ingredient texts ("A+B", "A(B)") as spaces.</summary>
    private static string SplitMarks(string text) => text.Replace('+', ' ').Replace('(', ' ');
}
