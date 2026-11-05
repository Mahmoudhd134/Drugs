namespace ClinicHub.Application.Common.Settings;

/// <summary>
/// Config section <c>Attachments</c> (docs/design/attachments.md § 5). Type lists are comma-separated strings, not arrays: .NET merges
/// arrays by index, while a later source replaces a string whole. Validated by <c>AttachmentSettingsValidation</c> in the attachments feature:
/// it needs the feature's modules and types, and <c>Common</c> never references <c>Features</c>.
/// </summary>
public class AttachmentSettings
{
    public const long BytesPerMb = 1_048_576;

    public int MaxFileSizeMb { get; set; }
    /// <summary>Type keys, comma separated; spaces and case don't matter. Empty accepts nothing.</summary>
    public string AllowedTypes { get; set; }
    public AttachmentPhysicalSettings Physical { get; set; } = new();
    /// <summary>Per-module overrides that can only narrow. Keys are compared exactly with <c>AttachmentModules.All</c>.</summary>
    public Dictionary<string, AttachmentModuleSettings> Modules { get; set; } = new(StringComparer.Ordinal);

    /// <summary>The module's effective limits: its own values where set, else the global ones. A module with no entry gets the global ones.</summary>
    public AttachmentModuleRules RulesFor(string module)
    {
        AttachmentModuleSettings overrides = null;
        if (module is not null)
            Modules?.TryGetValue(module, out overrides);
        return new AttachmentModuleRules(
            (overrides?.MaxFileSizeMb ?? MaxFileSizeMb) * BytesPerMb,
            TypeKeysOf(overrides?.AllowedTypes ?? AllowedTypes));
    }

    /// <summary>The root to use before it's checked: <paramref name="rootPath"/>; when blank, in Development <c>LocalApplicationData/ClinicHub/attachments</c>, else null.</summary>
    public static string DefaultedRoot(string rootPath, bool isDevelopment)
    {
        if (!string.IsNullOrWhiteSpace(rootPath))
            return rootPath;
        return isDevelopment
            // DoNotVerify: on Linux the plain call answers "" until that folder exists
            ? Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData, Environment.SpecialFolderOption.DoNotVerify),
                "ClinicHub", "attachments")
            : null;
    }

    /// <summary>A comma-separated type list as normalized keys (trimmed, lower case).</summary>
    internal static HashSet<string> TypeKeysOf(string list) =>
        (list ?? "")
        .Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
        .Select(key => key.ToLowerInvariant())
        .ToHashSet(StringComparer.Ordinal);
}

/// <summary>A module's override: either value may be left out (null), and then the global one applies.</summary>
public class AttachmentModuleSettings
{
    public int? MaxFileSizeMb { get; set; }
    public string AllowedTypes { get; set; }
}

public class AttachmentPhysicalSettings
{
    /// <summary>Absolute, outside the site. Empty: see <see cref="AttachmentSettings.DefaultedRoot"/>.</summary>
    public string RootPath { get; set; }
}

/// <summary>Resolved limits for one module. <see cref="TypeKeys"/> are normalized (trimmed, lower case).</summary>
public sealed record AttachmentModuleRules(long MaxFileSizeBytes, IReadOnlySet<string> TypeKeys);
