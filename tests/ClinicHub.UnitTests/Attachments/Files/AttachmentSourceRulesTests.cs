using System.Text.RegularExpressions;
using Shouldly;

namespace ClinicHub.UnitTests.Attachments.Files;

/// <summary>
/// No file is ever hard deleted (A8): the cleanup of a file that never became an attachment is the only caller of
/// <c>IAttachmentFileProvider.DeleteAsync</c>, and its lookup is the only <c>IgnoreQueryFilters()</c> of the module
/// (docs/design/attachments.md § 6). Read as text, comments removed.
/// </summary>
[Trait("Area", "attachments")]
public partial class AttachmentSourceRulesTests
{
    private static readonly string[] Projects = ["ClinicHub.Application", "ClinicHub.Infrastructure", "ClinicHub.Api"];

    [Fact]
    [Trait("Case", "ATT-107")]
    public void The_module_has_exactly_one_IgnoreQueryFilters_and_one_provider_delete_both_in_the_cleanup()
    {
        var files = ModuleFiles();
        files.Select(f => f.Path).ShouldContain(p => p.EndsWith("Files/AttachmentService.cs", StringComparison.Ordinal), "the module's sources were not found");

        var ignores = files.SelectMany(f => QueryFilterBypass().Matches(f.Code).Select(m => (f.Path, f.Code, m.Index))).ToList();
        var deletes = files.SelectMany(f => DeleteCall().Matches(f.Code).Select(m => (f.Path, f.Code, m.Index))).ToList();

        ignores.Count.ShouldBe(1, "IgnoreQueryFilters() is a documented exception for the cleanup's lookup only: " + string.Join(", ", ignores.Select(i => i.Path)));
        deletes.Count.ShouldBe(1, "the cleanup is the only caller of the provider's DeleteAsync (A8): " + string.Join(", ", deletes.Select(d => d.Path)));

        ignores[0].Path.ShouldBe(deletes[0].Path, "the lookup and the delete are one cleanup");
        ignores[0].Index.ShouldBeLessThan(deletes[0].Index, "the cleanup decides by the lookup, then removes the file");
        var between = ignores[0].Code[ignores[0].Index..deletes[0].Index];
        MemberDeclaration().IsMatch(between).ShouldBeFalse("the lookup and the delete are in one member: " + between);
    }

    [Fact]
    [Trait("Case", "ATT-107")]
    public void Outside_the_module_only_the_dependency_registration_names_the_file_provider()
    {
        // No leading I: the concrete class's DeleteAsync is as reachable as the interface's
        AllFiles()
            .Where(f => !IsModule(f.Path) && f.Code.Contains("AttachmentFileProvider", StringComparison.Ordinal))
            .Select(f => f.Path)
            .ShouldBe(["ClinicHub.Infrastructure/DependencyInjection.cs"], ignoreOrder: true, "no other code can reach the provider's DeleteAsync");
    }

    [Fact]
    [Trait("Case", "ATT-107")]
    public void No_production_file_but_the_service_touches_the_attachments_table()
    {
        // The only hit is itself the control: the scan really sees the service's db.Attachments
        AllFiles()
            .Where(f => !f.Path.EndsWith("/AppDbContext.cs", StringComparison.Ordinal) && !f.Path.EndsWith("/IAppDbContext.cs", StringComparison.Ordinal))
            .Where(f => TableAccess().IsMatch(UsingOrNamespaceLine().Replace(f.Code, "")))
            .Select(f => f.Path)
            .ShouldBe(["ClinicHub.Application/Features/Attachments/Files/AttachmentService.cs"], ignoreOrder: true,
                "all access goes through the service (docs/design/attachments.md § 4): elsewhere it could skip the deleted check or the clinic check");
    }

    private sealed record SourceFile(string Path, string Code);

    private static List<SourceFile> ModuleFiles() => AllFiles().Where(f => IsModule(f.Path)).ToList();

    private static bool IsModule(string path) => path.Contains("/Attachments/", StringComparison.Ordinal);

    /// <summary>The backend's C# (no bin, obj or migrations), comments removed, paths relative with '/'.</summary>
    private static List<SourceFile> AllFiles()
    {
        var root = RepositoryRoot();
        return Projects
            .SelectMany(project => Directory.EnumerateFiles(Path.Combine(root, project), "*.cs", SearchOption.AllDirectories))
            .Select(path => Path.GetRelativePath(root, path).Replace('\\', '/'))
            .Where(path => !path.Contains("/bin/", StringComparison.Ordinal)
                && !path.Contains("/obj/", StringComparison.Ordinal)
                && !path.Contains("/Migrations/", StringComparison.Ordinal))
            .Select(path => new SourceFile(path, WithoutComments(File.ReadAllText(Path.Combine(root, path)))))
            .ToList();
    }

    private static string WithoutComments(string code) =>
        string.Join('\n', BlockComment().Replace(code, " ").Split('\n').Select(line => LineComment().Replace(line, "")));

    private static string RepositoryRoot()
    {
        for (var dir = new DirectoryInfo(AppContext.BaseDirectory); dir is not null; dir = dir.Parent)
            if (File.Exists(Path.Combine(dir.FullName, "ClinicHub.sln")))
                return dir.FullName;
        throw new InvalidOperationException("ClinicHub.sln not found above " + AppContext.BaseDirectory);
    }

    [GeneratedRegex(@"/\*.*?\*/", RegexOptions.Singleline)]
    private static partial Regex BlockComment();

    [GeneratedRegex(@"//.*$")]
    private static partial Regex LineComment();

    [GeneratedRegex(@"\.IgnoreQueryFilters\s*\(")]
    private static partial Regex QueryFilterBypass();

    /// <summary>A call or a method group, so preceded by a dot: the methods' own declarations aren't. The module's service never calls its own <c>DeleteAsync</c> through a dot.</summary>
    [GeneratedRegex(@"\.DeleteAsync\b")]
    private static partial Regex DeleteCall();

    /// <summary>The context's set of the table; the settings' <c>Attachments</c> section is another thing of that name.</summary>
    [GeneratedRegex(@"(?<!ettings)\.Attachments\b|\.Set<Attachment>")]
    private static partial Regex TableAccess();

    /// <summary>The namespaces hold <c>.Attachments</c> too. Only a directive: <c>using var rows = db.Attachments…</c> stays in the scan.</summary>
    [GeneratedRegex(@"^\s*(?:(?:global\s+)?using\s+(?:static\s+)?(?:\w+\s*=\s*)?[\w.]+\s*;|namespace\s+[\w.]+)", RegexOptions.Multiline)]
    private static partial Regex UsingOrNamespaceLine();

    [GeneratedRegex(@"^\s*(public|private|internal|protected)\s", RegexOptions.Multiline)]
    private static partial Regex MemberDeclaration();
}
