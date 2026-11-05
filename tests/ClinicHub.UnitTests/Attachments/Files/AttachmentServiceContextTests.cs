using ClinicHub.Application.Features.Attachments.Files;
using Shouldly;
using static ClinicHub.UnitTests.Attachments.Files.AttachmentServiceHarness;

namespace ClinicHub.UnitTests.Attachments.Files;

/// <summary>A write with no clinic or no user in context is the feature's bug: it throws before the database or the disk (docs/design/attachments.md § 4).</summary>
[Trait("Area", "attachments")]
public class AttachmentServiceContextTests
{
    private readonly AttachmentServiceHarness harness = new();

    /// <summary>Async, so a check before the method's first <c>await</c> counts the same as one after it.</summary>
    private async Task Write(string method)
    {
        var id = Guid.NewGuid();
        switch (method)
        {
            case "Replace": await harness.Service.ReplaceAsync(G, id, Upload("a.png", AttachmentSamples.Png)); break;
            case "Delete": await harness.Service.DeleteAsync(G, id); break;
            case "DeleteAll": await harness.Service.DeleteAllAsync(G); break;
            default: throw new ArgumentOutOfRangeException(nameof(method));
        }
    }

    [Theory]
    [Trait("Case", "ATT-031")]
    [InlineData("Replace")]
    [InlineData("Delete")]
    [InlineData("DeleteAll")]
    public async Task With_no_clinic_and_outside_the_block_a_write_throws_before_the_database(string method)
    {
        harness.Clinic.ClinicId = null;

        var error = await Should.ThrowAsync<InvalidOperationException>(() => Write(method));

        error.Message.ShouldContain("no clinic");
        harness.Files.Saves.ShouldBeEmpty();
    }

    [Theory]
    [Trait("Case", "ATT-031")]
    [InlineData("Replace")]
    [InlineData("Delete")]
    [InlineData("DeleteAll")]
    public async Task With_no_clinic_inside_the_block_a_write_goes_on_to_the_database(string method)
    {
        harness.Clinic.ClinicId = null;
        harness.Clinic.WritingSharedCatalog = true;

        await Should.ThrowAsync<DatabaseReachedException>(() => Write(method));
    }

    [Fact]
    [Trait("Case", "ATT-035")]
    public async Task With_no_user_an_add_throws_before_the_write()
    {
        harness.NoUser = true;

        var error = await Should.ThrowAsync<InvalidOperationException>(async () => await harness.Service.AddAsync(G, Upload("a.png", AttachmentSamples.Png)));

        error.Message.ShouldContain("no user");
        harness.Files.Saves.ShouldBeEmpty();
    }
}
