using ClinicHub.Application.Common.Settings;
using ClinicHub.Application.Features.Attachments.Files;

namespace ClinicHub.Infrastructure.Attachments;

/// <summary>
/// Files under <c>Attachments:Physical:RootPath</c> (docs/design/attachments.md § 3): created at their key without overwriting, with no temp
/// file of our own. Every method refuses a bad key (<see cref="ArgumentException"/>) before any <c>Path</c> call.
/// </summary>
public sealed class PhysicalAttachmentFileProvider(AttachmentSettings settings) : IAttachmentFileProvider
{
    private const int BufferSize = 81_920;

    /// <summary>
    /// The whitelist, the same on every OS: lower-case ASCII letters, digits, <c>-</c> and <c>/</c>, with no empty segment. CI runs on Linux, where
    /// <c>..\</c> and <c>C:</c> are ordinary characters.
    /// </summary>
    internal static bool IsValidKey(string key)
    {
        if (string.IsNullOrEmpty(key) || key[0] == '/' || key[^1] == '/' || key.Contains("//", StringComparison.Ordinal))
            return false;
        return key.All(c => char.IsAsciiLetterLower(c) || char.IsAsciiDigit(c) || c is '-' or '/');
    }

    public async Task SaveAsync(string key, Stream content, CancellationToken ct = default)
    {
        var path = PathOf(key);
        ct.ThrowIfCancellationRequested();
        Directory.CreateDirectory(Path.GetDirectoryName(path));

        // Outside the try: an existing key throws here, and that first file isn't ours to remove
        var target = new FileStream(path, FileMode.CreateNew, FileAccess.Write, FileShare.None, BufferSize, FileOptions.Asynchronous);
        try
        {
            await using (target)
                await content.CopyToAsync(target, BufferSize, ct);
        }
        catch
        {
            RemovePartial(path);
            throw;
        }
    }

    public Task<Stream> OpenReadAsync(string key, CancellationToken ct = default)
    {
        var path = PathOf(key);
        ct.ThrowIfCancellationRequested();
        if (!File.Exists(path))
            return Task.FromResult<Stream>(null);
        try
        {
            return Task.FromResult<Stream>(new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.Read, BufferSize,
                FileOptions.Asynchronous | FileOptions.SequentialScan));
        }
        catch (Exception exception) when (exception is FileNotFoundException or DirectoryNotFoundException)
        {
            return Task.FromResult<Stream>(null);
        }
    }

    public Task DeleteAsync(string key, CancellationToken ct = default)
    {
        var path = PathOf(key);
        ct.ThrowIfCancellationRequested();
        // Checked first: File.Delete throws for a key whose folder doesn't exist
        if (File.Exists(path))
            File.Delete(path);
        return Task.CompletedTask;
    }

    private string PathOf(string key)
    {
        if (!IsValidKey(key))
            throw new ArgumentException("The attachment key isn't valid.", nameof(key));
        return Path.Combine(settings.Physical.RootPath, key.Replace('/', Path.DirectorySeparatorChar));
    }

    /// <summary>Best effort: the write's own failure is the one to report, and a partial file is unreachable anyway, since every read starts from a row.</summary>
    private static void RemovePartial(string path)
    {
        try
        {
            File.Delete(path);
        }
        catch (Exception exception) when (exception is IOException or UnauthorizedAccessException)
        {
            // Stays as a stray file (docs/design/attachments.md § 6)
        }
    }
}
