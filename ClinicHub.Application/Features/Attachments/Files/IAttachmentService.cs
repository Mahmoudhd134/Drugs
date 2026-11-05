using ClinicHub.Application.Common.Results;

namespace ClinicHub.Application.Features.Attachments.Files;

/// <summary>
/// The one way to reach attachments (docs/design/attachments.md § 3, § 6). Features call it from their own commands and queries,
/// so a feature's record check and the attachment row share one transaction. With no clinic and outside
/// <c>IClinicScope.UseSharedCatalog()</c>, every write method throws before touching anything.
/// </summary>
public interface IAttachmentService
{
    Task<Result<AttachmentDto>> AddAsync(AttachmentOwner owner, AttachmentUpload file, CancellationToken ct = default);

    /// <summary>A new row and file with a new ID; the old row is marked and its file stays on disk.</summary>
    Task<Result<AttachmentDto>> ReplaceAsync(AttachmentOwner owner, Guid id, AttachmentUpload file, CancellationToken ct = default);

    /// <summary>Marks the row only: the file stays on disk.</summary>
    Task<Result> DeleteAsync(AttachmentOwner owner, Guid id, CancellationToken ct = default);

    /// <summary>The owner's record is being deleted: marks the owner's rows of the current clinic (or the platform's, with no clinic).</summary>
    Task DeleteAllAsync(AttachmentOwner owner, CancellationToken ct = default);

    /// <summary>The owner's rows, not deleted, newest first (<c>CreatedAt</c>, then <c>Id</c>).</summary>
    Task<IReadOnlyList<AttachmentDto>> ListAsync(AttachmentOwner owner, CancellationToken ct = default);

    Task<Result<AttachmentContent>> OpenAsync(AttachmentOwner owner, Guid id, CancellationToken ct = default);

    /// <summary>What the module's config allows, for a screen.</summary>
    AttachmentRulesDto GetRules(string module);
}
