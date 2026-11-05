using System.Reflection;
using ClinicHub.Application.Common.Abstractions;
using ClinicHub.Application.Common.Settings;
using ClinicHub.Application.Features.Attachments.Files;
using ClinicHub.UnitTests.TestSupport;
using Microsoft.Extensions.Logging.Abstractions;
using Shouldly;

namespace ClinicHub.UnitTests.Attachments.Files;

/// <summary>Thrown by the fake database: the code under test reached it.</summary>
public sealed class DatabaseReachedException(string member) : Exception($"The database was reached: {member}");

/// <summary>Thrown by the fake provider's save: the upload passed every rule and reached the write. No row is ever saved.</summary>
public sealed class WriteReachedException() : Exception("The upload reached the write.");

/// <summary>
/// An <see cref="AttachmentService"/> (docs/design/attachments.md § 5, § 6) with no database: a refusal answers before any row, and an accepted
/// upload stops at the provider's sentinel. Clinic 7 in context, the design's example config: M = <c>clinicPaper</c> (PNG, JPEG, 2 MB) and
/// G = any other module (the global list, 20 MB).
/// </summary>
public sealed class AttachmentServiceHarness
{
    private const int ClinicInContext = 7;

    public static readonly AttachmentOwner M = new(AttachmentModules.ClinicPaper, "1");
    public static readonly AttachmentOwner G = new("anyOtherModule", "1");

    public const string AllTypes = "png,jpeg,webp,gif,bmp,avif,tiff,heic,pdf,docx,xlsx,pptx,doc,xls,ppt,txt,csv";

    public RecordingFileProvider Files { get; } = new();

    public AttachmentSettings Settings { get; } = DesignSettings();

    /// <summary>The design's example config (§ 5).</summary>
    public static AttachmentSettings DesignSettings() => new()
    {
        MaxFileSizeMb = 20,
        AllowedTypes = AllTypes,
        Modules = new(StringComparer.Ordinal)
        {
            [AttachmentModules.ClinicPaper] = new AttachmentModuleSettings { MaxFileSizeMb = 2, AllowedTypes = "png,jpeg" },
        },
    };

    internal AttachmentService Service => new(
        UnreachableDatabase.Create(),
        new ClinicContext { ClinicId = ClinicInContext },
        new SignedInUser(),
        Files,
        Settings,
        new QueuedActions(),
        new FixedClock(new DateTimeOffset(2026, 11, 6, 10, 0, 0, TimeSpan.Zero)),
        NullLogger<AttachmentService>.Instance);

    public static AttachmentUpload Upload(string name, byte[] content) => new(name, () => new MemoryStream(content));

    /// <summary>The upload is refused with this code, and nothing is written.</summary>
    internal async Task ShouldRefuse(AttachmentOwner owner, AttachmentUpload upload, string code)
    {
        var result = await Service.AddAsync(owner, upload);

        result.IsSuccess.ShouldBeFalse();
        result.Error.Code.ShouldBe(code);
        Files.Saves.ShouldBeEmpty();
    }

    /// <summary>The upload passes every rule and reaches the write; gives the key it was written under.</summary>
    internal async Task<string> ShouldReachTheWrite(AttachmentOwner owner, AttachmentUpload upload)
    {
        await Should.ThrowAsync<WriteReachedException>(async () => await Service.AddAsync(owner, upload));
        Files.Saves.Count.ShouldBe(1);
        return Files.Saves[0].Key;
    }

    private sealed class SignedInUser : ICurrentUser
    {
        public bool IsAuthenticated => true;
        public int? UserId => 5;
        public Guid? SessionId => Guid.Empty;
        public int? ClinicId => ClinicInContext;
        public int? StaffId => 3;
        public bool IsClinic => true;
        public bool IsPlatform => false;
        public bool IsSuperAdmin => false;
    }

    /// <summary>Holds the queued cleanup without running it: no row exists to look for here.</summary>
    private sealed class QueuedActions : IPostCommitActions
    {
        public Task AddAsync(Func<CancellationToken, Task> action) => Task.CompletedTask;
    }
}

/// <summary>Every member of the database throws, so a test notices any use of it, whatever gets added to the interface later.</summary>
public class UnreachableDatabase : DispatchProxy
{
    public static IAppDbContext Create() => Create<IAppDbContext, UnreachableDatabase>();

    protected override object Invoke(MethodInfo targetMethod, object[] args) => throw new DatabaseReachedException(targetMethod?.Name);
}

/// <summary>What one save received, on arrival: the key, the stream itself and its position.</summary>
public sealed record RecordedSave(string Key, Stream Content, long Position);

/// <summary>Records each save, then throws <see cref="WriteReachedException"/>.</summary>
public sealed class RecordingFileProvider : IAttachmentFileProvider
{
    public List<RecordedSave> Saves { get; } = [];

    public Task SaveAsync(string key, Stream content, CancellationToken ct = default)
    {
        Saves.Add(new RecordedSave(key, content, content.Position));
        throw new WriteReachedException();
    }

    public Task<Stream> OpenReadAsync(string key, CancellationToken ct = default) => throw new InvalidOperationException("Not expected here.");

    public Task DeleteAsync(string key, CancellationToken ct = default) => throw new InvalidOperationException("Not expected here.");
}
