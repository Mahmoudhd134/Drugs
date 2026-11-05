using ClinicHub.Application.Common.Abstractions;
using ClinicHub.Application.Common.Messaging;
using ClinicHub.Application.Common.Results;
using ClinicHub.Application.Common.Settings;
using ClinicHub.Application.Features.Attachments.Files;
using ClinicHub.Infrastructure.Database;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace ClinicHub.IntegrationTests.Attachments.TestHost;

// A feature's commands and queries as the design describes them: they call the service, so the row shares the command's
// transaction (design § 3), and only the handler opens UseSharedCatalog() (design § 4). MediatR scans only the Application
// assembly: AttachmentTestHost registers these handlers.

public sealed record AddTestAttachment(AttachmentOwner Owner, AttachmentUpload File, bool SharedCatalog = false) : ICommand<AttachmentDto>;

public sealed class AddTestAttachmentHandler(IAttachmentService attachments, IClinicScope scope) : ICommandHandler<AddTestAttachment, AttachmentDto>
{
    public async Task<Result<AttachmentDto>> Handle(AddTestAttachment request, CancellationToken cancellationToken)
    {
        using var block = request.SharedCatalog ? scope.UseSharedCatalog() : null;
        return await attachments.AddAsync(request.Owner, request.File, cancellationToken);
    }
}

public sealed record ReplaceTestAttachment(AttachmentOwner Owner, Guid Id, AttachmentUpload File, bool SharedCatalog = false) : ICommand<AttachmentDto>;

public sealed class ReplaceTestAttachmentHandler(IAttachmentService attachments, IClinicScope scope) : ICommandHandler<ReplaceTestAttachment, AttachmentDto>
{
    public async Task<Result<AttachmentDto>> Handle(ReplaceTestAttachment request, CancellationToken cancellationToken)
    {
        using var block = request.SharedCatalog ? scope.UseSharedCatalog() : null;
        return await attachments.ReplaceAsync(request.Owner, request.Id, request.File, cancellationToken);
    }
}

public sealed record DeleteTestAttachment(AttachmentOwner Owner, Guid Id, bool SharedCatalog = false) : ICommand;

public sealed class DeleteTestAttachmentHandler(IAttachmentService attachments, IClinicScope scope) : ICommandHandler<DeleteTestAttachment>
{
    public async Task<Result> Handle(DeleteTestAttachment request, CancellationToken cancellationToken)
    {
        using var block = request.SharedCatalog ? scope.UseSharedCatalog() : null;
        return await attachments.DeleteAsync(request.Owner, request.Id, cancellationToken);
    }
}

public sealed record DeleteAllTestAttachments(AttachmentOwner Owner) : ICommand;

public sealed class DeleteAllTestAttachmentsHandler(IAttachmentService attachments) : ICommandHandler<DeleteAllTestAttachments>
{
    public async Task<Result> Handle(DeleteAllTestAttachments request, CancellationToken cancellationToken)
    {
        await attachments.DeleteAllAsync(request.Owner, cancellationToken);
        return Result.Success();
    }
}

public sealed record ListTestAttachments(AttachmentOwner Owner) : IQuery<IReadOnlyList<AttachmentDto>>;

public sealed class ListTestAttachmentsHandler(IAttachmentService attachments) : IQueryHandler<ListTestAttachments, IReadOnlyList<AttachmentDto>>
{
    public async Task<Result<IReadOnlyList<AttachmentDto>>> Handle(ListTestAttachments request, CancellationToken cancellationToken) =>
        Result<IReadOnlyList<AttachmentDto>>.Success(await attachments.ListAsync(request.Owner, cancellationToken));
}

public sealed record OpenTestAttachment(AttachmentOwner Owner, Guid Id) : IQuery<AttachmentContent>;

public sealed class OpenTestAttachmentHandler(IAttachmentService attachments) : IQueryHandler<OpenTestAttachment, AttachmentContent>
{
    public Task<Result<AttachmentContent>> Handle(OpenTestAttachment request, CancellationToken cancellationToken) =>
        attachments.OpenAsync(request.Owner, request.Id, cancellationToken);
}

/// <summary>What a scenario command does once its file is added.</summary>
public enum AddThen
{
    /// <summary>Returns a failed <see cref="Result"/> (409 <c>conflict</c>): the transaction rolls back.</summary>
    Fail,

    /// <summary>Throws (500 <c>unexpected</c>): the transaction rolls back.</summary>
    Throw,

    /// <summary>Throws with the database refusing lookups on the table, so the cleanup's lookup fails too.</summary>
    ThrowWithLookupsDown,

    /// <summary>The file is added under a token that's cancelled during the row's save, as a request gone away (500 <c>unexpected</c> here: the request itself stays).</summary>
    CancelDuringSave,
}

public sealed record AddTestAttachmentThen(AttachmentOwner Owner, AttachmentUpload File, AddThen Then) : ICommand<AttachmentDto>;

public sealed class AddTestAttachmentThenHandler(IAttachmentService attachments, AppDbContext db, AttachmentSettings settings, AttachmentSeams seams)
    : ICommandHandler<AddTestAttachmentThen, AttachmentDto>
{
    public async Task<Result<AttachmentDto>> Handle(AddTestAttachmentThen request, CancellationToken cancellationToken)
    {
        if (request.Then == AddThen.CancelDuringSave)
        {
            using var cancel = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
            seams.OnAttachmentSaving = cancel.Cancel;
            seams.CancelAttachmentSave = true;
            return await attachments.AddAsync(request.Owner, request.File, cancel.Token);
        }

        var added = await AddAndRecordAsync(attachments, db, settings, seams, request.Owner, request.File, cancellationToken);
        if (!added.IsSuccess)
            return added;
        switch (request.Then)
        {
            case AddThen.Fail:
                return CommonErrors.Conflict;
            case AddThen.ThrowWithLookupsDown:
                seams.FailAttachmentLookups = true;
                throw new InvalidOperationException("Test scenario: the command throws.");
            default:
                throw new InvalidOperationException("Test scenario: the command throws.");
        }
    }

    /// <summary>Adds the file; on success records its row and whether its file is on disk at this moment, before any cleanup could run.</summary>
    internal static async Task<Result<AttachmentDto>> AddAndRecordAsync(IAttachmentService attachments, AppDbContext db, AttachmentSettings settings,
        AttachmentSeams seams, AttachmentOwner owner, AttachmentUpload file, CancellationToken cancellationToken)
    {
        var added = await attachments.AddAsync(owner, file, cancellationToken);
        if (!added.IsSuccess)
            return added;
        var key = await db.Attachments.AsNoTracking().Where(a => a.Id == added.Data.Id).Select(a => a.StorageKey).SingleAsync(cancellationToken);
        seams.AddedByCommands.Enqueue(new AddedByCommand(added.Data.Id, key, File.Exists(Path.Combine(settings.Physical.RootPath, key))));
        return added;
    }
}

public sealed record AddTestAttachmentWithFailedNested(AttachmentOwner Owner, AttachmentUpload File) : ICommand<AttachmentDto>;

public sealed class AddTestAttachmentWithFailedNestedHandler(IAttachmentService attachments, AppDbContext db, AttachmentSettings settings, AttachmentSeams seams, ISender sender)
    : ICommandHandler<AddTestAttachmentWithFailedNested, AttachmentDto>
{
    public async Task<Result<AttachmentDto>> Handle(AddTestAttachmentWithFailedNested request, CancellationToken cancellationToken)
    {
        var outer = await AddTestAttachmentThenHandler.AddAndRecordAsync(attachments, db, settings, seams, request.Owner, request.File, cancellationToken);
        if (!outer.IsSuccess)
            return outer;
        var nested = await sender.Send(new AddTestAttachmentThen(request.Owner, request.File, AddThen.Fail), cancellationToken);
        if (nested.IsSuccess)
            throw new InvalidOperationException("The nested command must fail.");
        return outer;
    }
}

public sealed record AddTestAttachmentInUseBlock(int ClinicId, AttachmentOwner Owner, AttachmentUpload File) : ICommand<AttachmentDto>;

public sealed class AddTestAttachmentInUseBlockHandler(IAttachmentService attachments, IClinicScope scope) : ICommandHandler<AddTestAttachmentInUseBlock, AttachmentDto>
{
    public async Task<Result<AttachmentDto>> Handle(AddTestAttachmentInUseBlock request, CancellationToken cancellationToken)
    {
        using (scope.Use(request.ClinicId))
            return await attachments.AddAsync(request.Owner, request.File, cancellationToken);
    }
}
