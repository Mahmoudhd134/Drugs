using ClinicHub.Application.Features.Attachments.Files;
using ClinicHub.Application.Features.Attachments.FileTypes;

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
        if (MaxFileSizeMb < 1)
            throw new InvalidOperationException($"Attachments:MaxFileSizeMb is {MaxFileSizeMb}: it must be at least 1.");
        var globalTypes = KnownTypeKeys(AllowedTypes, "Attachments:AllowedTypes");

        foreach (var (module, overrides) in Modules ?? new())
            ValidateModule(module, overrides, globalTypes);

        // Last: the folder is created only for a config that is otherwise good
        Physical ??= new AttachmentPhysicalSettings();
        Physical.RootPath = ValidatedRoot(isDevelopment, contentRoot, webRoot);
    }

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

    private void ValidateModule(string module, AttachmentModuleSettings overrides, HashSet<string> globalTypes)
    {
        if (!AttachmentModules.All.Contains(module))
            throw new InvalidOperationException($"Attachments:Modules:{module} is not a known module (AttachmentModules; the case must match).");
        if (overrides is null)
            return;

        if (overrides.MaxFileSizeMb is < 1)
            throw new InvalidOperationException($"Attachments:Modules:{module}:MaxFileSizeMb is {overrides.MaxFileSizeMb}: it must be at least 1.");
        if (overrides.MaxFileSizeMb > MaxFileSizeMb)
            throw new InvalidOperationException(
                $"Attachments:Modules:{module}:MaxFileSizeMb is {overrides.MaxFileSizeMb}, above Attachments:MaxFileSizeMb ({MaxFileSizeMb}): a module can only narrow.");

        if (overrides.AllowedTypes is null)
            return;
        foreach (var key in KnownTypeKeys(overrides.AllowedTypes, $"Attachments:Modules:{module}:AllowedTypes"))
            if (!globalTypes.Contains(key))
                throw new InvalidOperationException(
                    $"Attachments:Modules:{module}:AllowedTypes has '{key}', outside Attachments:AllowedTypes: a module can only narrow.");
    }

    private static HashSet<string> KnownTypeKeys(string list, string settingName)
    {
        var keys = TypeKeysOf(list);
        foreach (var key in keys)
            if (AttachmentTypes.Find(key) is null)
                throw new InvalidOperationException($"{settingName} has the unknown type '{key}'.");
        return keys;
    }

    private static HashSet<string> TypeKeysOf(string list) =>
        (list ?? "")
        .Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
        .Select(key => key.ToLowerInvariant())
        .ToHashSet(StringComparer.Ordinal);

    private string ValidatedRoot(bool isDevelopment, string contentRoot, string webRoot)
    {
        var root = DefaultedRoot(Physical.RootPath, isDevelopment) ?? throw new InvalidOperationException(
            "Attachments:Physical:RootPath is empty (set env var Attachments__Physical__RootPath to an absolute folder outside the site).");
        if (!Path.IsPathFullyQualified(root))
            throw new InvalidOperationException($"Attachments:Physical:RootPath '{root}' is relative: it must be an absolute folder outside the site.");

        var fullPath = Path.GetFullPath(root);
        RefuseInside(fullPath, contentRoot, "content root");
        RefuseInside(fullPath, webRoot, "web root");
        ProveWritable(fullPath);
        return fullPath;
    }

    private static void RefuseInside(string root, string siteFolder, string siteFolderName)
    {
        if (string.IsNullOrWhiteSpace(siteFolder))
            return;
        if (AttachmentRootRule.IsSameOrInside(root, Path.GetFullPath(siteFolder), Path.DirectorySeparatorChar, OperatingSystem.IsWindows()))
            throw new InvalidOperationException($"Attachments:Physical:RootPath '{root}' is the {siteFolderName} or inside it: it must be outside the site.");
    }

    private static void ProveWritable(string root)
    {
        try
        {
            Directory.CreateDirectory(root);
            var probe = Path.Combine(root, $"write-probe-{Guid.NewGuid():N}");
            File.WriteAllBytes(probe, [0]);
            File.Delete(probe);
        }
        catch (Exception exception) when (exception is IOException or UnauthorizedAccessException or NotSupportedException)
        {
            throw new InvalidOperationException(
                $"Attachments:Physical:RootPath '{root}' can't be created or written to: {exception.Message}", exception);
        }
    }
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
