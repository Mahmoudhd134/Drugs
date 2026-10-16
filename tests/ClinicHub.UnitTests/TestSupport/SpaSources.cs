using System.Text.RegularExpressions;

namespace ClinicHub.UnitTests.TestSupport;

/// <summary>
/// The SPA files the backend must agree with, copied next to the test assembly by the csproj (<c>spa/</c>):
/// <c>features/access/permissions.ts</c> and the locale files <c>en.ts</c> / <c>ar.ts</c>. Read as text (no TypeScript
/// toolchain here), relying on how these files are written by convention (no formatter enforces it): one key per line,
/// 4 spaces per nesting level, a nested object opened by <c>key: {</c> at the end of its line. A key written otherwise
/// (two keys on one line, 2-space indent) is not seen: see <see cref="ReaderHint"/>.
/// </summary>
public static partial class SpaSources
{
    /// <summary>Added to the failure messages of the tests that read these files, as a miss may be the reader's.</summary>
    public const string ReaderHint =
        "if the key does exist, SpaSources may not read the way it is written (one key per line, 4-space indent): see TestSupport/SpaSources.cs";

    public static string Read(string fileName) =>
        File.ReadAllText(Path.Combine(AppContext.BaseDirectory, "spa", fileName));

    /// <summary>The permission keys of <c>PERMISSIONS</c> in <c>permissions.ts</c> (its <c>"resource.action"</c> literals).</summary>
    public static IReadOnlyList<string> PermissionKeys()
    {
        var text = Read("permissions.ts");
        var start = text.IndexOf("export const PERMISSIONS = {", StringComparison.Ordinal);
        var end = text.IndexOf("} as const;", start, StringComparison.Ordinal);
        if (start < 0 || end < 0) throw new InvalidDataException("permissions.ts: no `export const PERMISSIONS = { … } as const;`");
        return KeyLiteral().Matches(text[start..end]).Select(m => m.Groups[1].Value).ToList();
    }

    /// <summary>
    /// Every text of a locale file by its dotted key (<c>errors.notFound</c>, <c>permissions.drugs.list</c>), like the
    /// Vitest <c>flatten</c>: the keys of the file's object literal, nested by their indentation.
    /// </summary>
    public static IReadOnlySet<string> LocaleKeys(string fileName)
    {
        var keys = new HashSet<string>(StringComparer.Ordinal);
        var path = new List<string>();
        var inside = false;
        foreach (var line in Read(fileName).Split('\n').Select(l => l.TrimEnd('\r')))
        {
            if (!inside)
            {
                inside = LocaleStart().IsMatch(line);
                continue;
            }
            if (line.StartsWith("};", StringComparison.Ordinal)) return keys;
            var match = KeyLine().Match(line);
            if (!match.Success) continue;
            var depth = match.Groups["indent"].Length / 4;
            var key = match.Groups["name"].Success ? match.Groups["name"].Value : match.Groups["quoted"].Value;
            while (path.Count >= depth) path.RemoveAt(path.Count - 1);
            if (match.Groups["rest"].Value.Trim() == "{") path.Add(key);
            else keys.Add(string.Join('.', path.Append(key)));
        }
        throw new InvalidDataException($"{fileName}: no `const … = {{ … }};` object literal");
    }

    [GeneratedRegex(@"""([a-z][a-zA-Z]*\.[a-z][a-zA-Z]*)""")]
    private static partial Regex KeyLiteral();

    [GeneratedRegex(@"^const \w+(: \w+)? = \{\s*$")]
    private static partial Regex LocaleStart();

    [GeneratedRegex(@"^(?<indent>(    )+)(?:(?<name>[A-Za-z_$][\w$]*)|""(?<quoted>[^""]+)""):(?<rest>.*)$")]
    private static partial Regex KeyLine();
}
