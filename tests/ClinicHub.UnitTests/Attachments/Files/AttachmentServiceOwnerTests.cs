using ClinicHub.Application.Features.Attachments.Files;
using Shouldly;
using static ClinicHub.UnitTests.Attachments.Files.AttachmentServiceHarness;

namespace ClinicHub.UnitTests.Attachments.Files;

/// <summary>A bad module or ref ID is the feature's bug, not the user's: it throws before anything is touched (docs/design/attachments.md § 4).</summary>
[Trait("Area", "attachments")]
public class AttachmentServiceOwnerTests
{
    private static readonly string[] Methods = ["Add", "Replace", "Delete", "DeleteAll", "List", "Open"];

    private static readonly (string Module, string RefId)[] BadOwners =
    [
        (null, "1"),
        ("", "1"),
        ("   ", "1"),
        (new string('m', 51), "1"),
        ("anyOtherModule", null),
        ("anyOtherModule", ""),
        ("anyOtherModule", "   "),
        ("anyOtherModule", new string('r', 65)),
    ];

    public static TheoryData<string, string, string> EveryMethodWithEveryBadOwner
    {
        get
        {
            var data = new TheoryData<string, string, string>();
            foreach (var method in Methods)
                foreach (var (module, refId) in BadOwners)
                    data.Add(method, module, refId);
            return data;
        }
    }

    private readonly AttachmentServiceHarness harness = new();

    /// <summary>Async, so a check before the method's first <c>await</c> counts the same as one after it.</summary>
    private async Task Call(string method, AttachmentOwner owner)
    {
        var upload = Upload("a.png", AttachmentSamples.Png);
        var id = Guid.NewGuid();
        switch (method)
        {
            case "Add": await harness.Service.AddAsync(owner, upload); break;
            case "Replace": await harness.Service.ReplaceAsync(owner, id, upload); break;
            case "Delete": await harness.Service.DeleteAsync(owner, id); break;
            case "DeleteAll": await harness.Service.DeleteAllAsync(owner); break;
            case "List": await harness.Service.ListAsync(owner); break;
            case "Open": await harness.Service.OpenAsync(owner, id); break;
            default: throw new ArgumentOutOfRangeException(nameof(method));
        }
    }

    [Theory]
    [Trait("Case", "ATT-091")]
    [MemberData(nameof(EveryMethodWithEveryBadOwner))]
    public async Task A_blank_or_over_the_column_module_or_ref_id_throws_before_the_database_or_the_disk(string method, string module, string refId)
    {
        var error = await Should.ThrowAsync<Exception>(() => Call(method, new AttachmentOwner(module, refId)));

        error.ShouldNotBeOfType<NotImplementedException>();
        error.ShouldNotBeOfType<DatabaseReachedException>();
        error.ShouldNotBeOfType<WriteReachedException>();
        harness.Files.Saves.ShouldBeEmpty();
    }

    [Theory]
    [Trait("Case", "ATT-091")]
    [InlineData("List")]
    [InlineData("Open")]
    [InlineData("Delete")]
    [InlineData("DeleteAll")]
    [InlineData("Replace")]
    public async Task A_module_of_50_and_a_ref_id_of_64_characters_are_valid_and_go_on_to_the_database(string method)
    {
        var owner = new AttachmentOwner(new string('m', 50), new string('r', 64));

        await Should.ThrowAsync<DatabaseReachedException>(() => Call(method, owner));
    }

    [Fact]
    [Trait("Case", "ATT-091")]
    public async Task A_module_of_50_and_a_ref_id_of_64_characters_can_be_uploaded_to()
    {
        var owner = new AttachmentOwner(new string('m', 50), new string('r', 64));

        await harness.ShouldReachTheWrite(owner, Upload("a.png", AttachmentSamples.Png));
    }

    [Theory]
    [Trait("Case", "ATT-091")]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   ")]
    [InlineData("mmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmm")] // 51
    public void GetRules_throws_for_a_blank_or_too_long_module(string module)
    {
        Should.Throw<Exception>(() => harness.Service.GetRules(module)).ShouldNotBeOfType<NotImplementedException>();
    }
}
