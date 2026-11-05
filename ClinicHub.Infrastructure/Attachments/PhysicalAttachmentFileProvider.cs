using ClinicHub.Application.Common.Settings;
using ClinicHub.Application.Features.Attachments.Files;

namespace ClinicHub.Infrastructure.Attachments;

/// <summary>
/// Files under <c>Attachments:Physical:RootPath</c> (docs/design/attachments.md § 3): created at their key without overwriting, with no temp
/// file of our own. Every method refuses a bad key (<see cref="ArgumentException"/>) before any <c>Path</c> call.
/// </summary>
public sealed class PhysicalAttachmentFileProvider(AttachmentSettings settings) : IAttachmentFileProvider
{
    /// <summary>
    /// The whitelist, the same on every OS: lower-case ASCII letters, digits, <c>-</c> and <c>/</c>, with no empty segment. CI runs on Linux, where
    /// <c>..\</c> and <c>C:</c> are ordinary characters.
    /// </summary>
    internal static bool IsValidKey(string key) => throw new NotImplementedException();

    public Task SaveAsync(string key, Stream content, CancellationToken ct = default) => throw new NotImplementedException();

    public Task<Stream> OpenReadAsync(string key, CancellationToken ct = default) => throw new NotImplementedException();

    public Task DeleteAsync(string key, CancellationToken ct = default) => throw new NotImplementedException();
}
