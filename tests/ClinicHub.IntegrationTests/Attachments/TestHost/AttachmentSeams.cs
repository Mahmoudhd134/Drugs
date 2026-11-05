using System.Collections.Concurrent;
using System.Data.Common;
using ClinicHub.Application.Common.Settings;
using ClinicHub.Application.Features.Attachments.Files;
using ClinicHub.Domain.Attachments;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;

namespace ClinicHub.IntegrationTests.Attachments.TestHost;

/// <summary>A file a scenario command added, and whether it was on disk right after the add.</summary>
public sealed record AddedByCommand(Guid Id, string Key, bool FileWasOnDisk);

/// <summary>An attachment row about to be saved, and whether its file was already on disk.</summary>
public sealed record AttachmentBeingSaved(Guid Id, string Key, bool FileWasOnDisk);

/// <summary>One save that held attachment rows: how many new ones and how many changed ones.</summary>
public sealed record AttachmentSave(int Added, int Changed);

/// <summary>
/// The failure seams of a test app (one per app; every switch off by default, reset before each test) and what they saw. The
/// real provider and the real save run unless a test arms a switch.
/// </summary>
public sealed class AttachmentSeams
{
    /// <summary>The provider's write throws, as a full or failed disk.</summary>
    public volatile bool FailFileWrites;
    /// <summary>A save holding a new attachment row throws before reaching the database.</summary>
    public volatile bool FailAttachmentSave;
    /// <summary>A save holding an attachment row reaches the database, commits when no transaction is open, then throws: a lost connection.</summary>
    public volatile bool ThrowAfterAttachmentSave;
    /// <summary>A save holding a new attachment row throws <see cref="OperationCanceledException"/>, after <see cref="OnAttachmentSaving"/>.</summary>
    public volatile bool CancelAttachmentSave;
    /// <summary>Any read of the attachments table throws, as a database gone down.</summary>
    public volatile bool FailAttachmentLookups;
    public Action OnAttachmentSaving;

    public ConcurrentQueue<AddedByCommand> AddedByCommands { get; } = new();
    public ConcurrentQueue<AttachmentBeingSaved> BeingSaved { get; } = new();
    /// <summary>Every save that held a new or a changed attachment row, whether or not it then failed.</summary>
    public ConcurrentQueue<AttachmentSave> Saves { get; } = new();
    /// <summary>The keys the provider really wrote.</summary>
    public ConcurrentQueue<string> Written { get; } = new();
    /// <summary>The keys the cleanup asked the provider to remove.</summary>
    public ConcurrentQueue<string> Removed { get; } = new();

    public void Reset()
    {
        FailFileWrites = false;
        FailAttachmentSave = false;
        ThrowAfterAttachmentSave = false;
        CancelAttachmentSave = false;
        FailAttachmentLookups = false;
        OnAttachmentSaving = null;
        AddedByCommands.Clear();
        BeingSaved.Clear();
        Saves.Clear();
        Written.Clear();
        Removed.Clear();
    }
}

/// <summary>Wraps the real provider: only moves bytes through, unless <see cref="AttachmentSeams.FailFileWrites"/>.</summary>
public sealed class SeamAttachmentFileProvider(IAttachmentFileProvider inner, AttachmentSeams seams) : IAttachmentFileProvider
{
    public async Task SaveAsync(string key, Stream content, CancellationToken ct = default)
    {
        if (seams.FailFileWrites)
            throw new IOException("Test seam: the disk failed.");
        await inner.SaveAsync(key, content, ct);
        seams.Written.Enqueue(key);
    }

    public Task<Stream> OpenReadAsync(string key, CancellationToken ct = default) => inner.OpenReadAsync(key, ct);

    public Task DeleteAsync(string key, CancellationToken ct = default)
    {
        seams.Removed.Enqueue(key);
        return inner.DeleteAsync(key, ct);
    }
}

/// <summary>The save's failure seams, on the real <c>AppDbContext</c>.</summary>
public sealed class AttachmentSaveSeam(AttachmentSeams seams, AttachmentSettings settings) : SaveChangesInterceptor
{
    public override ValueTask<InterceptionResult<int>> SavingChangesAsync(DbContextEventData eventData, InterceptionResult<int> result,
        CancellationToken cancellationToken = default)
    {
        var rows = eventData.Context!.ChangeTracker.Entries<Attachment>().ToList();
        var added = rows.Where(e => e.State == EntityState.Added).Select(e => e.Entity).ToList();
        var changed = rows.Count(e => e.State == EntityState.Modified);
        if (added.Count + changed > 0)
            seams.Saves.Enqueue(new AttachmentSave(added.Count, changed));
        if (added.Count == 0)
            return ValueTask.FromResult(result);

        foreach (var row in added)
            seams.BeingSaved.Enqueue(new AttachmentBeingSaved(row.Id, row.StorageKey, File.Exists(Path.Combine(settings.Physical.RootPath, row.StorageKey))));
        seams.OnAttachmentSaving?.Invoke();
        if (seams.CancelAttachmentSave)
            throw new OperationCanceledException("Test seam: the request was cancelled during the save.");
        if (seams.FailAttachmentSave)
            throw new InvalidOperationException("Test seam: the save failed.");
        return ValueTask.FromResult(result);
    }

    public override ValueTask<int> SavedChangesAsync(SaveChangesCompletedEventData eventData, int result, CancellationToken cancellationToken = default)
    {
        if (seams.ThrowAfterAttachmentSave && eventData.Context!.ChangeTracker.Entries<Attachment>().Any())
            throw new InvalidOperationException("Test seam: the save committed, then the connection was lost.");
        return ValueTask.FromResult(result);
    }
}

/// <summary>Fails reads of the attachments table while <see cref="AttachmentSeams.FailAttachmentLookups"/> is on.</summary>
public sealed class AttachmentLookupSeam(AttachmentSeams seams) : DbCommandInterceptor
{
    public override InterceptionResult<DbDataReader> ReaderExecuting(DbCommand command, CommandEventData eventData, InterceptionResult<DbDataReader> result)
    {
        ThrowIfDown(command);
        return result;
    }

    public override ValueTask<InterceptionResult<DbDataReader>> ReaderExecutingAsync(DbCommand command, CommandEventData eventData,
        InterceptionResult<DbDataReader> result, CancellationToken cancellationToken = default)
    {
        ThrowIfDown(command);
        return ValueTask.FromResult(result);
    }

    private void ThrowIfDown(DbCommand command)
    {
        if (seams.FailAttachmentLookups && command.CommandText.Contains("FROM \"Attachments\"", StringComparison.Ordinal))
            throw new InvalidOperationException("Test seam: the database is down.");
    }
}
