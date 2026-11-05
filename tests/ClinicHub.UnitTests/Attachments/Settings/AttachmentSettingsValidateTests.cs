using ClinicHub.Application.Common.Settings;
using ClinicHub.Application.Features.Attachments.Files;
using Shouldly;

namespace ClinicHub.UnitTests.Attachments.Settings;

/// <summary>
/// What stops the app at startup (docs/design/attachments.md § 5). Every test has real folders in its own temp sandbox, removed afterwards, with
/// a valid root unless the root is what's tested, so each failure is for its own reason.
/// </summary>
[Trait("Area", "attachments")]
public sealed class AttachmentSettingsValidateTests : IDisposable
{
    private const string Paper = AttachmentModules.ClinicPaper;

    private readonly string sandbox = Path.Combine(Path.GetTempPath(), "clinichub-att-" + Guid.NewGuid().ToString("N"));
    private readonly string contentRoot;
    private readonly string webRoot;
    private readonly string root;

    public AttachmentSettingsValidateTests()
    {
        contentRoot = Directory.CreateDirectory(Path.Combine(sandbox, "site")).FullName;
        webRoot = Directory.CreateDirectory(Path.Combine(sandbox, "site", "wwwroot")).FullName;
        root = Path.Combine(sandbox, "files");
    }

    public void Dispose()
    {
        if (Directory.Exists(sandbox)) Directory.Delete(sandbox, recursive: true);
    }

    private AttachmentSettings Valid(string rootPath = null) => new()
    {
        MaxFileSizeMb = 20,
        AllowedTypes = "png,jpeg,pdf",
        Physical = new AttachmentPhysicalSettings { RootPath = rootPath ?? root },
    };

    private AttachmentSettings WithPaper(int? mb = null, string types = null)
    {
        var settings = Valid();
        settings.Modules[Paper] = new AttachmentModuleSettings { MaxFileSizeMb = mb, AllowedTypes = types };
        return settings;
    }

    private void ShouldStart(AttachmentSettings settings, bool isDevelopment = false) =>
        settings.Validate(isDevelopment, contentRoot, webRoot);

    private InvalidOperationException ShouldNotStart(AttachmentSettings settings, bool isDevelopment = false) =>
        Should.Throw<InvalidOperationException>(() => settings.Validate(isDevelopment, contentRoot, webRoot));

    private static string WithSeparator(string path) => path + Path.DirectorySeparatorChar;

    // ---- The control: everything here starts ----

    [Theory]
    [Trait("Case", "ATT-069")]
    [InlineData(true)]
    [InlineData(false)]
    public void A_valid_config_with_a_root_outside_the_site_starts_and_the_root_exists(bool isDevelopment)
    {
        var settings = Valid();

        ShouldStart(settings, isDevelopment);

        settings.Physical.RootPath.ShouldBe(root);
        Directory.Exists(root).ShouldBeTrue();
    }

    [Fact]
    [Trait("Case", "ATT-069")]
    public void The_root_is_replaced_by_its_resolved_full_path()
    {
        var settings = Valid(Path.Combine(sandbox, "site", "..", "files"));

        ShouldStart(settings);

        settings.Physical.RootPath.ShouldBe(root);
    }

    // ---- Type keys ----

    [Fact]
    [Trait("Case", "ATT-060")]
    public void An_unknown_type_key_in_the_global_list_stops_the_app_and_the_message_names_it()
    {
        var settings = Valid();
        settings.AllowedTypes = "png,exe";

        ShouldNotStart(settings).Message.ShouldContain("exe");
    }

    [Fact]
    [Trait("Case", "ATT-060")]
    public void An_unknown_type_key_in_a_modules_list_stops_the_app_and_the_message_names_it()
    {
        ShouldNotStart(WithPaper(types: "png,svg")).Message.ShouldContain("svg");
    }

    [Fact]
    [Trait("Case", "ATT-060")]
    public void The_17_known_type_keys_all_start()
    {
        var settings = Valid();
        settings.AllowedTypes = "png,jpeg,webp,gif,bmp,avif,tiff,heic,pdf,docx,xlsx,pptx,doc,xls,ppt,txt,csv";

        ShouldStart(settings);
    }

    // ---- Module keys ----

    [Fact]
    [Trait("Case", "ATT-061")]
    public void A_modules_key_not_in_AttachmentModules_stops_the_app_and_the_message_names_it()
    {
        var settings = Valid();
        settings.Modules["profilePicture"] = new AttachmentModuleSettings { MaxFileSizeMb = 1 };

        ShouldNotStart(settings).Message.ShouldContain("profilePicture");
    }

    [Theory]
    [Trait("Case", "ATT-075")]
    [InlineData("clinicpaper")]
    [InlineData("ClinicPaper")]
    [InlineData("CLINICPAPER")]
    public void A_modules_key_in_the_wrong_case_stops_the_app(string wrongCase)
    {
        var settings = Valid();
        settings.Modules[wrongCase] = new AttachmentModuleSettings { MaxFileSizeMb = 1 };

        ShouldNotStart(settings).Message.ShouldContain(wrongCase);
    }

    [Fact]
    [Trait("Case", "ATT-075")]
    public void A_modules_key_in_the_right_case_starts()
    {
        ShouldStart(WithPaper(mb: 2));
    }

    // ---- Sizes ----

    [Theory]
    [Trait("Case", "ATT-062")]
    [InlineData(0)]
    [InlineData(-1)]
    public void A_global_size_below_1_stops_the_app(int mb)
    {
        var settings = Valid();
        settings.MaxFileSizeMb = mb;

        ShouldNotStart(settings);
    }

    [Theory]
    [Trait("Case", "ATT-062")]
    [InlineData(0)]
    [InlineData(-1)]
    public void A_modules_size_below_1_stops_the_app(int mb)
    {
        ShouldNotStart(WithPaper(mb: mb));
    }

    [Fact]
    [Trait("Case", "ATT-062")]
    public void A_size_of_1_starts()
    {
        var settings = WithPaper(mb: 1);
        settings.MaxFileSizeMb = 1;

        ShouldStart(settings);
    }

    // ---- A module can only narrow ----

    [Fact]
    [Trait("Case", "ATT-063")]
    public void A_modules_size_above_the_global_stops_the_app()
    {
        ShouldNotStart(WithPaper(mb: 21));
    }

    [Fact]
    [Trait("Case", "ATT-063")]
    public void A_modules_size_equal_to_the_global_starts()
    {
        ShouldStart(WithPaper(mb: 20));
    }

    [Fact]
    [Trait("Case", "ATT-063")]
    public void A_modules_known_type_outside_the_global_list_stops_the_app_and_the_message_names_it()
    {
        ShouldNotStart(WithPaper(types: "png,gif")).Message.ShouldContain("gif");
    }

    [Fact]
    [Trait("Case", "ATT-063")]
    public void A_modules_types_inside_the_global_list_start()
    {
        ShouldStart(WithPaper(types: "png,jpeg,pdf"));
        ShouldStart(WithPaper(types: "pdf"));
    }

    [Fact]
    [Trait("Case", "ATT-064")]
    public void A_module_with_only_a_size_or_only_types_starts()
    {
        ShouldStart(WithPaper(mb: 2));
        ShouldStart(WithPaper(types: "png"));
    }

    // ---- Empty and untidy lists ----

    [Fact]
    [Trait("Case", "ATT-066")]
    public void An_empty_global_or_module_list_starts_and_accepts_nothing()
    {
        var emptyGlobal = Valid();
        emptyGlobal.AllowedTypes = "";
        ShouldStart(emptyGlobal);
        emptyGlobal.RulesFor(Paper).TypeKeys.ShouldBeEmpty();

        var emptyModule = WithPaper(types: "");
        ShouldStart(emptyModule);
        emptyModule.RulesFor(Paper).TypeKeys.ShouldBeEmpty();
    }

    [Fact]
    [Trait("Case", "ATT-067")]
    public void Keys_with_spaces_or_another_case_start_in_both_lists()
    {
        var settings = WithPaper(types: " PNG , jpeg ");
        settings.AllowedTypes = " Png , JPEG , pdf ";

        ShouldStart(settings);
    }

    // ---- The root ----

    [Theory]
    [Trait("Case", "ATT-069")]
    [InlineData("attachments")]
    [InlineData("./attachments")]
    [InlineData("../attachments")]
    public void A_relative_root_stops_the_app(string relative)
    {
        ShouldNotStart(Valid(relative));
        ShouldNotStart(Valid(relative), isDevelopment: true);
    }

    [Fact]
    [Trait("Case", "ATT-069")]
    public void A_root_inside_the_content_root_stops_the_app()
    {
        ShouldNotStart(Valid(Path.Combine(contentRoot, "files")));
        ShouldNotStart(Valid(Path.Combine(contentRoot, "deep", "down", "files")));
    }

    [Fact]
    [Trait("Case", "ATT-069")]
    public void A_root_inside_the_web_root_stops_the_app()
    {
        var aWebRootOutsideTheSite = Directory.CreateDirectory(Path.Combine(sandbox, "public")).FullName;
        var settings = Valid(Path.Combine(aWebRootOutsideTheSite, "files"));

        Should.Throw<InvalidOperationException>(() => settings.Validate(false, contentRoot, aWebRootOutsideTheSite));
    }

    [Fact]
    [Trait("Case", "ATT-069")]
    public void A_root_that_reaches_the_content_root_through_dot_dot_stops_the_app()
    {
        ShouldNotStart(Valid(Path.Combine(sandbox, "files", "..", "site", "files")));
    }

    [Fact]
    [Trait("Case", "ATT-069")]
    public void A_root_beside_the_content_root_with_the_same_prefix_starts()
    {
        var settings = Valid(contentRoot + "Files");

        ShouldStart(settings);

        settings.Physical.RootPath.ShouldBe(contentRoot + "Files");
    }

    [Theory]
    [Trait("Case", "ATT-071")]
    [InlineData("")]
    [InlineData("   ")]
    [InlineData(null)]
    public void An_empty_root_outside_development_stops_the_app(string empty)
    {
        var settings = Valid();
        settings.Physical.RootPath = empty;

        ShouldNotStart(settings);
    }

    [Theory]
    [Trait("Case", "ATT-071")]
    [InlineData("")]
    [InlineData("   ")]
    [InlineData(null)]
    public void An_empty_root_in_development_means_the_default_folder(string empty)
    {
        var expected = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "ClinicHub", "attachments");

        AttachmentSettings.DefaultedRoot(empty, isDevelopment: true).ShouldBe(expected);
    }

    [Theory]
    [Trait("Case", "ATT-071")]
    [InlineData("")]
    [InlineData("   ")]
    [InlineData(null)]
    public void An_empty_root_anywhere_else_has_no_default(string empty)
    {
        AttachmentSettings.DefaultedRoot(empty, isDevelopment: false).ShouldBeNull();
    }

    [Theory]
    [Trait("Case", "ATT-071")]
    [InlineData(true)]
    [InlineData(false)]
    public void A_set_root_is_kept_in_any_environment(bool isDevelopment)
    {
        AttachmentSettings.DefaultedRoot(root, isDevelopment).ShouldBe(root);
    }

    [Fact]
    [Trait("Case", "ATT-073")]
    public void A_root_equal_to_the_content_root_stops_the_app()
    {
        ShouldNotStart(Valid(contentRoot));
    }

    [Fact]
    [Trait("Case", "ATT-073")]
    public void A_root_equal_to_the_web_root_stops_the_app()
    {
        var aWebRootOutsideTheSite = Directory.CreateDirectory(Path.Combine(sandbox, "public")).FullName;

        Should.Throw<InvalidOperationException>(() => Valid(aWebRootOutsideTheSite).Validate(false, contentRoot, aWebRootOutsideTheSite));
    }

    [Fact]
    [Trait("Case", "ATT-073")]
    public void A_trailing_slash_on_the_root_is_judged_the_same()
    {
        ShouldNotStart(Valid(WithSeparator(contentRoot)));
        ShouldStart(Valid(WithSeparator(root)));
    }

    [Fact]
    [Trait("Case", "ATT-073")]
    public void A_trailing_slash_on_the_content_root_is_judged_the_same()
    {
        Should.Throw<InvalidOperationException>(() => Valid(contentRoot).Validate(false, WithSeparator(contentRoot), webRoot));
        Should.Throw<InvalidOperationException>(() => Valid(Path.Combine(contentRoot, "files")).Validate(false, WithSeparator(contentRoot), webRoot));
        Should.NotThrow(() => Valid().Validate(false, WithSeparator(contentRoot), webRoot));
    }

    [Fact]
    [Trait("Case", "ATT-073")]
    public void No_web_root_is_skipped_and_the_content_root_still_counts()
    {
        Should.NotThrow(() => Valid().Validate(false, contentRoot, null));
        Should.Throw<InvalidOperationException>(() => Valid(Path.Combine(contentRoot, "files")).Validate(false, contentRoot, null));
        Directory.Exists(root).ShouldBeTrue();
    }
}
