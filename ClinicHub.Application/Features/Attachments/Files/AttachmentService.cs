using System.Globalization;
using ClinicHub.Application.Common.Abstractions;
using ClinicHub.Application.Common.Results;
using ClinicHub.Application.Common.Settings;
using ClinicHub.Application.Features.Attachments.FileTypes;
using ClinicHub.Domain.Attachments;
using ClinicHub.Domain.Common;
using Microsoft.EntityFrameworkCore;
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
    /// <summary>For a stored type this code no longer knows; never reached while <see cref="AttachmentTypes"/> only grows.</summary>
    private const string UnknownContentType = "application/octet-stream";

    public async Task<Result<AttachmentDto>> AddAsync(AttachmentOwner owner, AttachmentUpload file, CancellationToken ct = default)
    {
        GuardWrite();
        GuardOwner(owner);

        var (error, upload) = Check(owner.Module, file);
        if (error is not null)
            return error;

        return await StoreAsync(owner, file, upload, replaced: null, ct);
    }

    public async Task<Result<AttachmentDto>> ReplaceAsync(AttachmentOwner owner, Guid id, AttachmentUpload file, CancellationToken ct = default)
    {
        GuardWrite();
        GuardOwner(owner);

        var old = await WritableRows(owner).FirstOrDefaultAsync(a => a.Id == id, ct);
        if (old is null)
            return AttachmentErrors.NotFound;

        var (error, upload) = Check(owner.Module, file);
        if (error is not null)
            return error;

        return await StoreAsync(owner, file, upload, old, ct);
    }

    public async Task<Result> DeleteAsync(AttachmentOwner owner, Guid id, CancellationToken ct = default)
    {
        GuardWrite();
        GuardOwner(owner);

        var row = await WritableRows(owner).FirstOrDefaultAsync(a => a.Id == id, ct);
        if (row is null)
            return AttachmentErrors.NotFound;

        MarkDeleted(row, CurrentUserId());
        await db.SaveChangesAsync(ct);
        return Result.Success();
    }

    public async Task DeleteAllAsync(AttachmentOwner owner, CancellationToken ct = default)
    {
        GuardWrite();
        GuardOwner(owner);

        var rows = await WritableRows(owner).ToListAsync(ct);
        if (rows.Count == 0)
            return;

        var userId = CurrentUserId();
        foreach (var row in rows)
            MarkDeleted(row, userId);
        await db.SaveChangesAsync(ct);
    }

    public async Task<IReadOnlyList<AttachmentDto>> ListAsync(AttachmentOwner owner, CancellationToken ct = default)
    {
        GuardOwner(owner);

        var rows = await OwnerRows(owner).AsNoTracking()
            .OrderByDescending(a => a.CreatedAt).ThenBy(a => a.Id)
            .ToListAsync(ct);
        return rows.Select(ToDto).ToList();
    }

    public async Task<Result<AttachmentContent>> OpenAsync(AttachmentOwner owner, Guid id, CancellationToken ct = default)
    {
        GuardOwner(owner);

        var row = await OwnerRows(owner).AsNoTracking().FirstOrDefaultAsync(a => a.Id == id, ct);
        if (row is null)
            return AttachmentErrors.NotFound;

        var content = await files.OpenReadAsync(row.StorageKey, ct);
        if (content is null)
        {
            logger.LogError("Attachment {AttachmentId} has a row but its file is missing", row.Id);
            return AttachmentErrors.NotFound;
        }
        return new AttachmentContent(content, row.OriginalFileName, ContentTypeOf(row.TypeKey));
    }

    public AttachmentRulesDto GetRules(string module)
    {
        GuardModule(module);

        var rules = settings.RulesFor(module);
        return new AttachmentRulesDto(
            rules.MaxFileSizeBytes,
            AttachmentTypes.All.Where(type => rules.TypeKeys.Contains(type.Key)).SelectMany(type => type.Extensions).ToList());
    }

    /// <summary>A forgotten clinic must not write a platform file: the feature's handler opens the shared block itself.</summary>
    private void GuardWrite()
    {
        if (clinic.ClinicId is null && !clinic.WritingSharedCatalog)
            throw new InvalidOperationException(
                "Attachments can't be written with no clinic in context outside IClinicScope.UseSharedCatalog().");
    }

    private static void GuardOwner(AttachmentOwner owner)
    {
        ArgumentNullException.ThrowIfNull(owner);
        GuardModule(owner.Module);
        if (string.IsNullOrWhiteSpace(owner.RefId) || owner.RefId.Length > FieldLimits.AttachmentRefIdMaxLength)
            throw new ArgumentException(
                $"An attachment's ref ID must be 1-{FieldLimits.AttachmentRefIdMaxLength} characters.", nameof(owner));
    }

    private static void GuardModule(string module)
    {
        if (string.IsNullOrWhiteSpace(module) || module.Length > FieldLimits.AttachmentModuleMaxLength)
            throw new ArgumentException(
                $"An attachment's module must be 1-{FieldLimits.AttachmentModuleMaxLength} characters.", nameof(module));
    }

    /// <summary>The one place that hides deleted rows: EF allows one query filter per entity, and the clinic filter holds it.</summary>
    private static IQueryable<Attachment> NotDeleted(IQueryable<Attachment> rows) => rows.Where(a => a.DeletedAt == null);

    /// <summary>What the owner can read. A clinic also sees platform rows, so every read matches module and ref ID too.</summary>
    private IQueryable<Attachment> OwnerRows(AttachmentOwner owner) =>
        NotDeleted(db.Attachments).Where(a => a.Module == owner.Module && a.RefId == owner.RefId);

    /// <summary>
    /// What the current context can change: its own rows only, so a platform row in a clinic is simply not found and the save interceptor's
    /// throw, which would roll back the feature's whole command, is never reached.
    /// </summary>
    private IQueryable<Attachment> WritableRows(AttachmentOwner owner)
    {
        var clinicId = clinic.ClinicId;
        return OwnerRows(owner).Where(a => a.ClinicId == clinicId);
    }

    /// <summary>The rules in § 5's order; the first failure answers. Reads the file through streams of its own, each from the start.</summary>
    private (Error Error, CheckedUpload Upload) Check(string module, AttachmentUpload file)
    {
        ArgumentNullException.ThrowIfNull(file);

        long size;
        using (var content = file.OpenRead())
            size = content.Length;
        if (size == 0)
            return (AttachmentErrors.Empty, null);

        var rules = settings.RulesFor(module);
        if (size > rules.MaxFileSizeBytes)
            return (AttachmentErrors.TooLarge, null);

        var name = AttachmentFileName.Clean(file.OriginalFileName);
        var nameError = AttachmentFileName.Check(name);
        if (nameError is not null)
            return (nameError, null);

        var type = AttachmentTypes.FindByExtension(AttachmentFileName.ExtensionOf(name));
        if (type is null || !rules.TypeKeys.Contains(type.Key))
            return (AttachmentErrors.TypeNotAllowed, null);

        using (var content = file.OpenRead())
            if (!AttachmentContentCheck.Matches(type.Key, content))
                return (AttachmentErrors.TypeNotAllowed, null);

        return (null, new CheckedUpload(name, type, size));
    }

    /// <summary>
    /// Writes the file, then saves its row (and marks <paramref name="replaced"/>, in the same save). The file is on disk before the row
    /// exists, so whatever happens to the save, the cleanup decides afterwards.
    /// </summary>
    private async Task<Result<AttachmentDto>> StoreAsync(AttachmentOwner owner, AttachmentUpload file, CheckedUpload upload,
        Attachment replaced, CancellationToken ct)
    {
        var userId = CurrentUserId();
        var id = Guid.NewGuid();
        var key = StorageKeyOf(id);

        using (var content = file.OpenRead())
            await files.SaveAsync(key, content, ct);

        var row = new Attachment
        {
            Id = id,
            ClinicId = clinic.ClinicId,
            Module = owner.Module,
            RefId = owner.RefId,
            OriginalFileName = upload.FileName,
            TypeKey = upload.Type.Key,
            SizeBytes = upload.SizeBytes,
            StorageKey = key,
            CreatedByUserId = userId,
        };
        try
        {
            if (replaced is not null)
                MarkDeleted(replaced, userId);
            db.Attachments.Add(row);
            await db.SaveChangesAsync(ct);
        }
        finally
        {
            // Queued whatever the save did: the commit decides later, and the action gets no request token, so it runs after a cancel too
            await postCommit.AddAsync(token => RemoveFileIfNoRowAsync(id, key, token));
        }
        return ToDto(row);
    }

    /// <summary>
    /// The only time a file is ever removed, and that file never became an attachment. It decides by a lookup, not by the save's result: a commit
    /// can reach the server and then lose the connection. The lookup sees every clinic's rows, because with no clinic in context (a <c>Use</c>
    /// block that ended) the filter would hide a committed row and this would delete its file. A failed lookup throws, so the file stays.
    /// </summary>
    private async Task RemoveFileIfNoRowAsync(Guid id, string key, CancellationToken token)
    {
        if (await db.Attachments.IgnoreQueryFilters().AsNoTracking().AnyAsync(a => a.Id == id, token))
            return;

        await files.DeleteAsync(key, token);
        logger.LogInformation("Removed the file of attachment {AttachmentId}: its row was never saved", id);
    }

    private string StorageKeyOf(Guid id) =>
        clinic.ClinicId is { } clinicId
            ? string.Create(CultureInfo.InvariantCulture, $"clinics/{clinicId}/{id:D}")
            : string.Create(CultureInfo.InvariantCulture, $"platform/{id:D}");

    private void MarkDeleted(Attachment row, int userId)
    {
        row.DeletedAt = clock.GetUtcNow().UtcDateTime;
        row.DeletedByUserId = userId;
    }

    private int CurrentUserId() =>
        user.UserId ?? throw new InvalidOperationException("Attachments can't be written with no user in context.");

    private static AttachmentDto ToDto(Attachment row) =>
        new(row.Id, row.OriginalFileName, row.TypeKey, ContentTypeOf(row.TypeKey), row.SizeBytes, row.CreatedAt);

    private static string ContentTypeOf(string typeKey) => AttachmentTypes.Find(typeKey)?.ContentType ?? UnknownContentType;

    private sealed record CheckedUpload(string FileName, AttachmentType Type, long SizeBytes);
}
