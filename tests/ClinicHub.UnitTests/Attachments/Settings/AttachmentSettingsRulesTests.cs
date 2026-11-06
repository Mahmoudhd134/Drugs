using ClinicHub.Application.Common.Settings;
using ClinicHub.Application.Features.Attachments.Files;
using Shouldly;

namespace ClinicHub.UnitTests.Attachments.Settings;

/// <summary>A module's effective limits: its own values where set, else the global ones (docs/design/attachments.md § 5).</summary>
[Trait("Area", "attachments")]
public class AttachmentSettingsRulesTests
{
    private const string Paper = AttachmentModules.ClinicPaper;

    private static AttachmentSettings Global(int mb = 20, string types = "png,jpeg,pdf") =>
        new() { MaxFileSizeMb = mb, AllowedTypes = types };

    private static AttachmentSettings WithPaper(AttachmentModuleSettings paper)
    {
        var settings = Global();
        settings.Modules[Paper] = paper;
        return settings;
    }

    [Fact]
    [Trait("Case", "ATT-064")]
    public void A_module_with_only_a_size_takes_its_types_from_the_global_list()
    {
        var rules = WithPaper(new AttachmentModuleSettings { MaxFileSizeMb = 2 }).RulesFor(Paper);

        rules.MaxFileSizeBytes.ShouldBe(2_097_152);
        rules.TypeKeys.ShouldBe(["png", "jpeg", "pdf"], ignoreOrder: true);
    }

    [Fact]
    [Trait("Case", "ATT-064")]
    public void A_module_with_only_types_takes_its_size_from_the_global_value()
    {
        var rules = WithPaper(new AttachmentModuleSettings { AllowedTypes = "png" }).RulesFor(Paper);

        rules.MaxFileSizeBytes.ShouldBe(20_971_520);
        rules.TypeKeys.ShouldBe(["png"]);
    }

    [Fact]
    [Trait("Case", "ATT-065")]
    public void A_module_with_no_entry_gets_the_global_values()
    {
        var settings = WithPaper(new AttachmentModuleSettings { MaxFileSizeMb = 2, AllowedTypes = "png" });

        var rules = settings.RulesFor("anyOtherModule");

        rules.MaxFileSizeBytes.ShouldBe(20_971_520);
        rules.TypeKeys.ShouldBe(["png", "jpeg", "pdf"], ignoreOrder: true);
    }

    [Fact]
    [Trait("Case", "ATT-065")]
    public void A_module_with_its_own_values_gets_those()
    {
        var rules = WithPaper(new AttachmentModuleSettings { MaxFileSizeMb = 2, AllowedTypes = "png,jpeg" }).RulesFor(Paper);

        rules.MaxFileSizeBytes.ShouldBe(2_097_152);
        rules.TypeKeys.ShouldBe(["png", "jpeg"], ignoreOrder: true);
    }

    [Fact]
    [Trait("Case", "ATT-065")]
    public void The_module_lookup_is_exact()
    {
        var settings = WithPaper(new AttachmentModuleSettings { MaxFileSizeMb = 2, AllowedTypes = "png" });

        settings.RulesFor("CLINICPAPER").MaxFileSizeBytes.ShouldBe(20_971_520);
    }

    [Fact]
    [Trait("Case", "ATT-066")]
    public void An_empty_global_list_accepts_nothing()
    {
        Global(types: "").RulesFor("anyOtherModule").TypeKeys.ShouldBeEmpty();
    }

    [Fact]
    [Trait("Case", "ATT-066")]
    public void An_empty_module_list_accepts_nothing_while_a_left_out_one_takes_the_global_list()
    {
        WithPaper(new AttachmentModuleSettings { AllowedTypes = "" }).RulesFor(Paper).TypeKeys.ShouldBeEmpty();
        WithPaper(new AttachmentModuleSettings { AllowedTypes = null }).RulesFor(Paper).TypeKeys.ShouldNotBeEmpty();
    }

    [Fact]
    [Trait("Case", "ATT-067")]
    public void Keys_with_spaces_or_another_case_are_normalized_in_the_global_list()
    {
        Global(types: " PNG , jpeg ").RulesFor("anyOtherModule").TypeKeys.ShouldBe(["png", "jpeg"], ignoreOrder: true);
    }

    [Fact]
    [Trait("Case", "ATT-067")]
    public void Keys_with_spaces_or_another_case_are_normalized_in_a_modules_list()
    {
        WithPaper(new AttachmentModuleSettings { AllowedTypes = " PNG , Jpeg " }).RulesFor(Paper).TypeKeys.ShouldBe(["png", "jpeg"], ignoreOrder: true);
    }

    [Theory]
    [Trait("Case", "ATT-074")]
    [InlineData(1, 1_048_576)]
    [InlineData(2, 2_097_152)]
    [InlineData(20, 20_971_520)]
    [InlineData(4096, 4_294_967_296)] // past int: the size is a long
    public void One_mb_in_config_is_1048576_bytes(int mb, long expectedBytes)
    {
        AttachmentSettings.BytesPerMb.ShouldBe(1_048_576);
        Global(mb: mb).RulesFor("anyOtherModule").MaxFileSizeBytes.ShouldBe(expectedBytes);
    }

    [Fact]
    [Trait("Case", "ATT-074")]
    public void A_modules_size_in_mb_is_counted_the_same_way()
    {
        WithPaper(new AttachmentModuleSettings { MaxFileSizeMb = 1 }).RulesFor(Paper).MaxFileSizeBytes.ShouldBe(1_048_576);
    }
}
