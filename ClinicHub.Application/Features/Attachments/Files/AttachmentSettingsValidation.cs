using ClinicHub.Application.Common.Settings;
using ClinicHub.Application.Features.Attachments.FileTypes;

namespace ClinicHub.Application.Features.Attachments.Files;

/// <summary>
/// The startup check of <see cref="AttachmentSettings"/> (docs/design/attachments.md § 5). Here and not beside the settings, because it needs
/// <see cref="AttachmentModules"/> and <see cref="AttachmentTypes"/> and <c>Common</c> never references <c>Features</c>.
/// </summary>
public static class AttachmentSettingsValidation
{
    /// <summary>
    /// Stops the app at startup (<see cref="InvalidOperationException"/>, naming what is wrong) on: an unknown type key (global or a module's),
    /// a module key not in <see cref="AttachmentModules.All"/>, a size below 1 (global or a module's), a module's size above the global or a type
    /// outside the global list, a relative root, a root equal to or inside <paramref name="contentRoot"/> or <paramref name="webRoot"/>, a root
    /// it can't create and write to, or an empty root outside Development. Replaces <see cref="AttachmentPhysicalSettings.RootPath"/> with the
    /// resolved full path.
    /// </summary>
    /// <param name="contentRoot">The host's content root.</param>
    /// <param name="webRoot">The host's web root; null (no <c>wwwroot</c>) is skipped.</param>
    public static void Validate(this AttachmentSettings settings, bool isDevelopment, string contentRoot, string webRoot)
    {
        if (settings.MaxFileSizeMb < 1)
            throw new InvalidOperationException($"Attachments:MaxFileSizeMb is {settings.MaxFileSizeMb}: it must be at least 1.");
        var globalTypes = KnownTypeKeys(settings.AllowedTypes, "Attachments:AllowedTypes");

        foreach (var (module, overrides) in settings.Modules ?? new())
            ValidateModule(module, overrides, settings.MaxFileSizeMb, globalTypes);

        // Last: the folder is created only for a config that is otherwise good
        settings.Physical ??= new AttachmentPhysicalSettings();
        settings.Physical.RootPath = ValidatedRoot(settings.Physical.RootPath, isDevelopment, contentRoot, webRoot);
    }

    private static void ValidateModule(string module, AttachmentModuleSettings overrides, int globalMaxFileSizeMb, HashSet<string> globalTypes)
    {
        if (!AttachmentModules.All.Contains(module))
            throw new InvalidOperationException($"Attachments:Modules:{module} is not a known module (AttachmentModules; the case must match).");
        if (overrides is null)
            return;

        if (overrides.MaxFileSizeMb is < 1)
            throw new InvalidOperationException($"Attachments:Modules:{module}:MaxFileSizeMb is {overrides.MaxFileSizeMb}: it must be at least 1.");
        if (overrides.MaxFileSizeMb > globalMaxFileSizeMb)
            throw new InvalidOperationException(
                $"Attachments:Modules:{module}:MaxFileSizeMb is {overrides.MaxFileSizeMb}, above Attachments:MaxFileSizeMb ({globalMaxFileSizeMb}): a module can only narrow.");

        if (overrides.AllowedTypes is null)
            return;
        foreach (var key in KnownTypeKeys(overrides.AllowedTypes, $"Attachments:Modules:{module}:AllowedTypes"))
            if (!globalTypes.Contains(key))
                throw new InvalidOperationException(
                    $"Attachments:Modules:{module}:AllowedTypes has '{key}', outside Attachments:AllowedTypes: a module can only narrow.");
    }

    private static HashSet<string> KnownTypeKeys(string list, string settingName)
    {
        var keys = AttachmentSettings.TypeKeysOf(list);
        foreach (var key in keys)
            if (AttachmentTypes.Find(key) is null)
                throw new InvalidOperationException($"{settingName} has the unknown type '{key}'.");
        return keys;
    }

    private static string ValidatedRoot(string rootPath, bool isDevelopment, string contentRoot, string webRoot)
    {
        var root = AttachmentSettings.DefaultedRoot(rootPath, isDevelopment) ?? throw new InvalidOperationException(
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
