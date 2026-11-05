using System.Security.Cryptography;

namespace ClinicHub.IntegrationTests.Attachments.TestHost;

/// <summary>
/// An app's attachments folder as a test sees it. "Nothing written" compares a folder before and after, because Respawn doesn't
/// reset the disk; "still on disk" reads the file at the root plus the row's <c>StorageKey</c>.
/// </summary>
public sealed class AttachmentDisk(string root)
{
    public string Root => root;

    public string PathOf(string storageKey) => Path.Combine(root, storageKey);

    public bool Has(string storageKey) => File.Exists(PathOf(storageKey));

    public byte[] Read(string storageKey) => File.ReadAllBytes(PathOf(storageKey));

    /// <summary>Every file of the clinic's own folder: relative path and content hash, sorted. Empty when the folder doesn't exist.</summary>
    public List<string> OfClinic(int clinicId) => Snapshot(Path.Combine(root, "clinics", clinicId.ToString()));

    /// <summary>Every file of the platform's folder.</summary>
    public List<string> OfPlatform() => Snapshot(Path.Combine(root, "platform"));

    /// <summary>Every file under the root.</summary>
    public List<string> All() => Snapshot(root);

    private List<string> Snapshot(string folder) =>
        !Directory.Exists(folder)
            ? []
            : Directory.EnumerateFiles(folder, "*", SearchOption.AllDirectories)
                .Select(file => $"{Path.GetRelativePath(root, file).Replace('\\', '/')}|{Convert.ToHexString(SHA256.HashData(File.ReadAllBytes(file)))}")
                .Order(StringComparer.Ordinal)
                .ToList();
}
