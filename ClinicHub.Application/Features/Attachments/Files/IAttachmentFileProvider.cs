namespace ClinicHub.Application.Features.Attachments.Files;

/// <summary>Only moves bytes: knows nothing about clinics, modules, types or permissions (docs/design/attachments.md § 3).</summary>
public interface IAttachmentFileProvider
{
    /// <summary>All or nothing: an existing key throws and keeps the first file; a failed or cancelled write leaves nothing under the key.</summary>
    Task SaveAsync(string key, Stream content, CancellationToken ct = default);

    /// <summary>Null when the key has no file.</summary>
    Task<Stream> OpenReadAsync(string key, CancellationToken ct = default);

    /// <summary>Failed uploads only (§ 6): the cleanup is the only caller. An unknown key is no error.</summary>
    Task DeleteAsync(string key, CancellationToken ct = default);
}
