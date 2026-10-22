using System.Text.RegularExpressions;
using Shouldly;

namespace ClinicHub.UnitTests.Catalog.SharedCatalog;

/// <summary>
/// Architecture rules of the shared catalog over the backend's source (design M1.7 D2, D7; M1.7b contract § 2.6):
/// the save interceptor is the only guard on drug rows and the only writer of the search columns, so nothing may write
/// <c>Drugs</c>, <c>Categories</c> or <c>SubCategories</c> around it (outside the admin catalog handlers and the
/// migrations; the test harness lives in <c>tests/</c>, not scanned), no <c>ExecuteUpdate</c> may set a searched text,
/// and search has no database-specific SQL. Read as text: comments are skipped, a statement is the text between two
/// <c>;</c>.
/// </summary>
[Trait("Area", "catalog")]
public partial class SourceRulesTests
{
    private static readonly string[] Projects = ["ClinicHub.Domain", "ClinicHub.Application", "ClinicHub.Infrastructure", "ClinicHub.Api"];

    /// <summary>Where bulk or raw writes of the catalog tables are allowed (contract § 2.6).</summary>
    private static readonly string[] CatalogWritersAllowed =
    [
        "ClinicHub.Application/Features/Platform/SharedDrugs/",
        "ClinicHub.Application/Features/Platform/DrugCategories/",
        "ClinicHub.Infrastructure/Migrations/",
    ];

    [Fact]
    [Trait("Case", "CAT-030")]
    public void No_bulk_update_bulk_delete_or_raw_sql_writes_the_catalog_tables_outside_the_admin_handlers_and_the_migrations()
    {
        var offending = Statements()
            .Where(s => !CatalogWritersAllowed.Any(allowed => s.File.StartsWith(allowed, StringComparison.Ordinal)))
            .Where(s => BulkOrRawWrite().IsMatch(s.Text) && CatalogTable().IsMatch(s.Text))
            .Select(s => $"{s.File}: {Shorten(s.Text)}")
            .ToList();

        offending.ShouldBeEmpty("ExecuteUpdate/ExecuteDelete/raw SQL on Drugs, Categories or SubCategories bypasses the save " +
            "interceptor (design M1.7 D2): only Features/Platform/SharedDrugs, Features/Platform/DrugCategories and the migrations may");
    }

    [Fact]
    [Trait("Case", "CAT-079")]
    public void No_ExecuteUpdate_anywhere_sets_a_searched_text()
    {
        var offending = Statements()
            .Where(s => s.Text.Contains("ExecuteUpdate", StringComparison.Ordinal) && SetsSearchedText().IsMatch(s.Text))
            .Select(s => $"{s.File}: {Shorten(s.Text)}")
            .ToList();

        offending.ShouldBeEmpty("an ExecuteUpdate of a drug's Name, NameAr or ActiveIngredients, a protocol's or clinic's Name or a " +
            "staff member's FullName (or of a shadow search column) leaves the search columns stale (design M1.7 D2, D7)");
    }

    [Fact]
    [Trait("Case", "CAT-079")]
    public void Search_uses_no_computed_column_no_translate_or_lower_sql_and_no_database_function()
    {
        var files = SourceFiles().Where(f => !f.Path.StartsWith("ClinicHub.Infrastructure/Migrations/", StringComparison.Ordinal)).ToList();

        files.Where(f => f.Code.Contains("HasComputedColumnSql", StringComparison.Ordinal)).Select(f => f.Path)
            .ShouldBeEmpty("HasComputedColumnSql: every search column is an ordinary column filled by the app (D7)");
        files.Where(f => SqlFold().IsMatch(f.Code)).Select(f => f.Path)
            .ShouldBeEmpty("translate( / lower( SQL: the term and the columns are folded by SearchText in C# (D7)");
        files.Where(f => f.Path.StartsWith("ClinicHub.Application/", StringComparison.Ordinal)
                && f.Code.Contains("EF.Functions", StringComparison.Ordinal)).Select(f => f.Path)
            .ShouldBeEmpty("EF.Functions: search uses no database function (D4, D7)");
    }

    [Fact]
    [Trait("Case", "CAT-079")]
    public void Search_handlers_compare_the_search_columns_with_Contains_or_StartsWith_only()
    {
        var uses = SourceFiles()
            .Where(f => f.Path.StartsWith("ClinicHub.Application/", StringComparison.Ordinal))
            .SelectMany(f => SearchColumnRead().Matches(f.Code).Select(m => (f.Path, Match: m)))
            .ToList();

        uses.ShouldNotBeEmpty("the search handlers read the search columns with EF.Property<string>(…, SearchText.Column)");
        uses.Where(u => !u.Match.Groups["call"].Success).Select(u => $"{u.Path}: {u.Match.Value}")
            .ShouldBeEmpty("a search column compared otherwise than .Contains( / .StartsWith( (D7)");
    }

    // ---- Source reading ----

    private sealed record SourceFile(string Path, string Code);

    private sealed record Statement(string File, string Text);

    private static string Shorten(string text)
    {
        var flat = Regex.Replace(text, @"\s+", " ").Trim();
        return flat.Length <= 160 ? flat : flat[..160] + "…";
    }

    private static IEnumerable<Statement> Statements() =>
        SourceFiles().SelectMany(f => f.Code.Split(';').Select(text => new Statement(f.Path, text)));

    /// <summary>Every C# file of the backend projects (no bin/obj), comments removed, paths relative with '/'.</summary>
    private static List<SourceFile> SourceFiles()
    {
        var root = RepositoryRoot();
        var files = Projects
            .SelectMany(project => Directory.EnumerateFiles(Path.Combine(root, project), "*.cs", SearchOption.AllDirectories))
            .Select(path => Path.GetRelativePath(root, path).Replace('\\', '/'))
            .Where(path => !path.Contains("/bin/", StringComparison.Ordinal) && !path.Contains("/obj/", StringComparison.Ordinal))
            .Select(path => new SourceFile(path, WithoutComments(File.ReadAllText(Path.Combine(root, path)))))
            .ToList();
        files.Count.ShouldBeGreaterThan(100, "the backend's source files were not found from " + root);
        return files;
    }

    private static string WithoutComments(string code)
    {
        code = BlockComment().Replace(code, " ");
        return string.Join('\n', code.Split('\n').Select(line =>
            line.TrimStart().StartsWith("//", StringComparison.Ordinal) ? "" : line));
    }

    /// <summary>The folder holding <c>ClinicHub.sln</c>, found upwards from the test assembly.</summary>
    private static string RepositoryRoot()
    {
        for (var dir = new DirectoryInfo(AppContext.BaseDirectory); dir is not null; dir = dir.Parent)
            if (File.Exists(Path.Combine(dir.FullName, "ClinicHub.sln")))
                return dir.FullName;
        throw new InvalidOperationException("ClinicHub.sln not found above " + AppContext.BaseDirectory);
    }

    [GeneratedRegex(@"/\*.*?\*/", RegexOptions.Singleline)]
    private static partial Regex BlockComment();

    [GeneratedRegex(@"\b(ExecuteUpdate|ExecuteDelete|ExecuteSql|ExecuteSqlRaw|ExecuteSqlInterpolated)\w*\s*\(")]
    private static partial Regex BulkOrRawWrite();

    [GeneratedRegex(@"\b(Drugs|Categories|SubCategories)\b|\bSet<(Drug|Category|SubCategory)>")]
    private static partial Regex CatalogTable();

    [GeneratedRegex(@"SetProperty\s*\(\s*\w+\s*=>\s*(\w+\.(Name|NameAr|ActiveIngredients|FullName)\b|EF\.Property)")]
    private static partial Regex SetsSearchedText();

    [GeneratedRegex(@"\b(translate|TRANSLATE|lower|LOWER)\s*\(")]
    private static partial Regex SqlFold();

    /// <summary><c>EF.Property&lt;string&gt;(x, SearchText.Column)</c> (or the other column), and the call right after it.</summary>
    [GeneratedRegex(@"EF\.Property<string>\(\s*\w+\s*,\s*(SearchText\.(Column|OtherColumn)|""Search(Name|Other)"")\s*\)(?<call>\s*\.(Contains|StartsWith)\()?")]
    private static partial Regex SearchColumnRead();
}
