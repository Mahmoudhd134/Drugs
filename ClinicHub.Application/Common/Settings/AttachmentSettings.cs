namespace ClinicHub.Application.Common.Settings;

/// <summary>
/// Config section <c>Attachments</c> (docs/design/attachments.md § 5). Type lists are comma-separated strings, not arrays: .NET merges
/// arrays by index, while a later source replaces a string whole.
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

    /// <summary>
    /// Stops the app at startup (<see cref="InvalidOperationException"/>, naming what is wrong) on: an unknown type key (global or a module's),
    /// a module key not in <c>AttachmentModules.All</c>, a size below 1 (global or a module's), a module's size above the global or a type
    /// outside the global list, a relative root, a root equal to or inside <paramref name="contentRoot"/> or <paramref name="webRoot"/>, a root
    /// it can't create and write to, or an empty root outside Development. Replaces <see cref="AttachmentPhysicalSettings.RootPath"/> with the
    /// resolved full path.
    /// </summary>
    /// <param name="contentRoot">The host's content root.</param>
    /// <param name="webRoot">The host's web root; null (no <c>wwwroot</c>) is skipped.</param>
    public void Validate(bool isDevelopment, string contentRoot, string webRoot)
    {
        // Contract only (T0): T1 writes the rules
    }

    /// <summary>The module's effective limits: its own values where set, else the global ones. A module with no entry gets the global ones.</summary>
    public AttachmentModuleRules RulesFor(string module) => throw new NotImplementedException();

    /// <summary>The root to use before it's checked: <paramref name="rootPath"/>; when blank, in Development <c>LocalApplicationData/ClinicHub/attachments</c>, else null.</summary>
    public static string DefaultedRoot(string rootPath, bool isDevelopment) => throw new NotImplementedException();
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
