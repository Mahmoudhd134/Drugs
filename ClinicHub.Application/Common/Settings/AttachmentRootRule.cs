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
    public static bool IsSameOrInside(string candidate, string parent, char separator, bool ignoreCase) =>
        throw new NotImplementedException();
}
