using System.Text;
// The Paging class: its folder has the same name (architecture § 3.7)
using PagingRules = ClinicHub.Application.Common.Paging.Paging;

namespace ClinicHub.Application.Common.Search;

/// <summary>
/// Arabic-normalized name search (M1.6.1, Q6). The searched tables (drugs, groups, clinics, staff) have a stored
/// generated column <see cref="Column"/>: the name lower-cased and folded by the database with the same table as
/// <see cref="Fold"/> (built from <see cref="Replacements"/> and <see cref="Removed"/> by Infrastructure's
/// <c>SearchNameConfiguration</c>). A search term is folded here the same way, so «اسبرين» finds «أسبرين» and back.
/// The two must stay identical: a change to the table here changes the column's SQL, which needs a new migration
/// (<c>dotnet ef migrations has-pending-model-changes</c> reports it).
/// </summary>
public static class SearchText
{
    /// <summary>The generated column (an EF shadow property) holding the folded name; read with <c>EF.Property</c>.</summary>
    public const string Column = "SearchName";

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
}
