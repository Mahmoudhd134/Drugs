using ClinicHub.Application.Features.Attachments.Files;
using Shouldly;

namespace ClinicHub.UnitTests.Attachments.Files;

/// <summary><c>GetRules</c>: what the module's config allows, for a screen (docs/design/attachments.md § 3, § 5; contract § 2).</summary>
[Trait("Area", "attachments")]
public class AttachmentRulesDtoTests
{
    private readonly AttachmentServiceHarness harness = new();

    [Fact]
    [Trait("Case", "ATT-184")]
    public void A_module_with_an_override_answers_its_own_limit_and_extensions()
    {
        var rules = harness.Service.GetRules(AttachmentModules.ClinicPaper);

        rules.MaxFileSizeBytes.ShouldBe(2_097_152);
        rules.Extensions.ShouldBe([".png", ".jpg", ".jpeg"]);
    }

    [Fact]
    [Trait("Case", "ATT-184")]
    public void A_module_with_no_entry_answers_the_global_limit_and_every_extension_in_the_tables_order()
    {
        var rules = harness.Service.GetRules("anyOtherModule");

        rules.MaxFileSizeBytes.ShouldBe(20_971_520);
        rules.Extensions.ShouldBe(
        [
            ".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp", ".avif", ".tif", ".tiff", ".heic", ".heif", ".pdf",
            ".docx", ".xlsx", ".pptx", ".doc", ".xls", ".ppt", ".txt", ".csv",
        ]);
    }

    [Fact]
    [Trait("Case", "ATT-184")]
    public void The_extensions_keep_the_tables_order_whatever_the_configs_order()
    {
        harness.Settings.Modules[AttachmentModules.ClinicPaper] = new() { AllowedTypes = " PDF , jpeg,png" };

        harness.Service.GetRules(AttachmentModules.ClinicPaper).Extensions.ShouldBe([".png", ".jpg", ".jpeg", ".pdf"]);
    }

    [Fact]
    [Trait("Case", "ATT-184")]
    public void A_module_that_accepts_nothing_answers_no_extensions()
    {
        harness.Settings.Modules[AttachmentModules.ClinicPaper] = new() { AllowedTypes = "" };

        harness.Service.GetRules(AttachmentModules.ClinicPaper).Extensions.ShouldBeEmpty();
    }

    [Fact]
    [Trait("Case", "ATT-184")]
    public void A_module_of_50_characters_is_valid()
    {
        harness.Service.GetRules(new string('m', 50)).MaxFileSizeBytes.ShouldBe(20_971_520);
    }
}
