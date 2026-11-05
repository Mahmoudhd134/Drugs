using ClinicHub.Application.Common.Settings;
using ClinicHub.Application.Features.Attachments.Files;
using ClinicHub.Infrastructure.Attachments;
using Shouldly;

namespace ClinicHub.UnitTests.Attachments.Providers;

/// <summary>
/// The contract on a real temp folder, removed afterwards. The root sits inside a sandbox, so a key that escapes it, on any OS, shows up in
/// <see cref="EverythingOnTheStore"/> (on Linux <c>..\x</c> and <c>C:x</c> would be ordinary file names under the root).
/// </summary>
[Trait("Area", "attachments")]
public sealed class PhysicalAttachmentFileProviderTests : AttachmentFileProviderContract, IDisposable
{
    private readonly string sandbox = Path.Combine(Path.GetTempPath(), "clinichub-att-" + Guid.NewGuid().ToString("N"));
    private readonly string root;

    public PhysicalAttachmentFileProviderTests()
    {
        root = Directory.CreateDirectory(Path.Combine(sandbox, "root")).FullName;
        Provider = new PhysicalAttachmentFileProvider(new AttachmentSettings { Physical = new AttachmentPhysicalSettings { RootPath = root } });
    }

    public void Dispose()
    {
        if (Directory.Exists(sandbox)) Directory.Delete(sandbox, recursive: true);
    }

    protected override IAttachmentFileProvider Provider { get; }

    protected override IReadOnlyList<string> StoredFiles() => Directory.GetFiles(sandbox, "*", SearchOption.AllDirectories);

    protected override IReadOnlyList<string> EverythingOnTheStore() =>
        Directory.GetFileSystemEntries(sandbox, "*", SearchOption.AllDirectories).Order(StringComparer.Ordinal).ToList();

    [Fact]
    [Trait("Case", "ATT-160")]
    public async Task The_file_sits_at_its_key_under_the_root_named_by_it_with_no_extension()
    {
        var id = Guid.NewGuid().ToString("D");

        await Provider.SaveAsync($"clinics/12/{id}", new MemoryStream([1, 2, 3]));

        var expected = Path.Combine(root, "clinics", "12", id);
        StoredFiles().ShouldBe([expected]);
        (await File.ReadAllBytesAsync(expected)).ShouldBe(new byte[] { 1, 2, 3 });
    }

    [Fact]
    [Trait("Case", "ATT-145")]
    public async Task After_the_opens_are_disposed_the_file_can_be_opened_for_writing_exclusively()
    {
        var id = Guid.NewGuid().ToString("D");
        await Provider.SaveAsync($"clinics/12/{id}", new MemoryStream([1, 2, 3]));
        var first = await Provider.OpenReadAsync($"clinics/12/{id}");
        var second = await Provider.OpenReadAsync($"clinics/12/{id}");
        await first.DisposeAsync();
        await second.DisposeAsync();

        await using var exclusive = new FileStream(Path.Combine(root, "clinics", "12", id), FileMode.Open, FileAccess.ReadWrite, FileShare.None);

        exclusive.Length.ShouldBe(3);
    }

    [Theory]
    [Trait("Case", "ATT-163")]
    [InlineData("clinics/12/0f8fad5b-d9cb-469f-a165-70867728950e", true)]
    [InlineData("platform/0f8fad5b-d9cb-469f-a165-70867728950e", true)]
    [InlineData("a", true)]
    [InlineData("a-1/b2", true)]
    [InlineData(@"..\x", false)]
    [InlineData("../x", false)]
    [InlineData("C:x", false)]
    [InlineData(@"\\s\x", false)]
    [InlineData("x:ads", false)]
    [InlineData("CON", false)]
    [InlineData("x.", false)]
    [InlineData("Clinics/1/x", false)]
    [InlineData("", false)]
    [InlineData(null, false)]
    [InlineData("/x", false)]
    [InlineData("x/", false)]
    [InlineData("a//b", false)]
    [InlineData("ملف", false)]
    [InlineData("a b", false)]
    public void The_key_whitelist_is_the_same_on_every_os(string key, bool valid)
    {
        PhysicalAttachmentFileProvider.IsValidKey(key).ShouldBe(valid);
    }
}
