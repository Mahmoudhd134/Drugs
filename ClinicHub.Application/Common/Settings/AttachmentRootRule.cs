namespace ClinicHub.Application.Common.Settings;

/// <summary>
/// The root path rule as a pure function, so the Windows behavior is proved on Linux CI (docs/design/attachments.md § 5). Takes the
/// separator and the case rule instead of reading the OS, and calls no <c>Path</c> method.
/// </summary>
internal static class AttachmentRootRule
{
    /// <summary>
    /// True when <paramref name="candidate"/> is <paramref name="parent"/> or truly inside it, compared by whole segments after resolving
    /// <c>.</c>, <c>..</c> and trailing separators: <c>C:\inetpub\ClinicHubFiles</c> isn't inside <c>C:\inetpub\ClinicHub</c>.
    /// </summary>
    /// <param name="separator"><c>\</c> means Windows, where <c>/</c> separates too; <c>/</c> means only <c>/</c> separates.</param>
    public static bool IsSameOrInside(string candidate, string parent, char separator, bool ignoreCase)
    {
        if (string.IsNullOrEmpty(candidate) || string.IsNullOrEmpty(parent))
            return false;

        var inner = Segments(candidate, separator);
        var outer = Segments(parent, separator);
        if (outer.Count > inner.Count)
            return false;

        var comparison = ignoreCase ? StringComparison.OrdinalIgnoreCase : StringComparison.Ordinal;
        return !outer.Where((segment, index) => !string.Equals(segment, inner[index], comparison)).Any();
    }

    private static List<string> Segments(string path, char separator)
    {
        var isWindows = separator == '\\';
        char[] separators = isWindows ? ['\\', '/'] : ['/'];
        var segments = new List<string>();
        foreach (var segment in path.Split(separators, StringSplitOptions.RemoveEmptyEntries))
        {
            if (segment == ".")
                continue;
            if (segment != "..")
                segments.Add(segment);
            // Going above the root stays at the root, and a drive letter is a root
            else if (segments.Count > 0 && !(isWindows && segments.Count == 1 && segments[0].EndsWith(':')))
                segments.RemoveAt(segments.Count - 1);
        }
        return segments;
    }
}
