using System.Text;
using ClinicHub.Application.Common.Search;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace ClinicHub.Infrastructure.Database.Configurations.Common;

/// <summary>
/// The stored generated column <see cref="SearchText.Column"/> of a searched table (M1.6.1, Q6):
/// <c>translate(lower(name), from, to)</c>, built from <see cref="SearchText.Replacements"/> and
/// <see cref="SearchText.Removed"/> (characters of <c>from</c> beyond the length of <c>to</c> are dropped by
/// <c>translate</c>), so the database folds a name exactly as <see cref="SearchText.Fold"/> folds a search term. They
/// must stay identical; a change to the table changes this SQL and needs a new migration. Display, ordering and the
/// stored names are unchanged; the column is only searched.
/// </summary>
public static class SearchNameConfiguration
{
    /// <summary>Adds the search column computed from <paramref name="sourceColumn"/> (the column name, e.g. "Name").</summary>
    public static void HasSearchName<T>(this EntityTypeBuilder<T> builder, string sourceColumn) where T : class =>
        builder.Property<string>(SearchText.Column)
            .HasComputedColumnSql(Sql(sourceColumn), stored: true)
            .IsRequired();

    /// <summary>
    /// The SQL expression, its Arabic letters written as PostgreSQL Unicode escapes (<c>U&amp;'\0623…'</c>) so the
    /// migration stays readable. <c>lower()</c> and <c>translate()</c> are immutable, as a generated column requires.
    /// </summary>
    public static string Sql(string sourceColumn)
    {
        var from = SearchText.Replacements.Select(r => r.From).Concat(SearchText.Removed);
        var to = SearchText.Replacements.Select(r => r.To);
        return $"translate(lower(\"{sourceColumn}\"), {UnicodeLiteral(from)}, {UnicodeLiteral(to)})";
    }

    private static string UnicodeLiteral(IEnumerable<char> chars)
    {
        var literal = new StringBuilder("U&'");
        foreach (var c in chars)
            literal.Append('\\').Append(((int)c).ToString("X4"));
        return literal.Append('\'').ToString();
    }
}
