using ClinicHub.Application.Common.Abstractions;
using ClinicHub.Application.Common.Results;
using ClinicHub.Application.Common.Settings;
using Microsoft.Extensions.Logging;

namespace ClinicHub.Application.Features.Attachments.Files;

/// <inheritdoc />
internal sealed class AttachmentService(
    IAppDbContext db,
    IClinicContext clinic,
    ICurrentUser user,
    IAttachmentFileProvider files,
    AttachmentSettings settings,
    IPostCommitActions postCommit,
    TimeProvider clock,
    ILogger<AttachmentService> logger) : IAttachmentService
{
    public Task<Result<AttachmentDto>> AddAsync(AttachmentOwner owner, AttachmentUpload file, CancellationToken ct = default) =>
        throw new NotImplementedException();

    public Task<Result<AttachmentDto>> ReplaceAsync(AttachmentOwner owner, Guid id, AttachmentUpload file, CancellationToken ct = default) =>
        throw new NotImplementedException();

    public Task<Result> DeleteAsync(AttachmentOwner owner, Guid id, CancellationToken ct = default) =>
        throw new NotImplementedException();

    public Task DeleteAllAsync(AttachmentOwner owner, CancellationToken ct = default) =>
        throw new NotImplementedException();

    public Task<IReadOnlyList<AttachmentDto>> ListAsync(AttachmentOwner owner, CancellationToken ct = default) =>
        throw new NotImplementedException();

    public Task<Result<AttachmentContent>> OpenAsync(AttachmentOwner owner, Guid id, CancellationToken ct = default) =>
        throw new NotImplementedException();

    public AttachmentRulesDto GetRules(string module) => throw new NotImplementedException();
}
