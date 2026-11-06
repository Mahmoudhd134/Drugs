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
    private const string RootSetting = "Attachments:Physical:RootPath";

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

    /// <summary>DoNotVerify: on Linux the plain call answers "" until that folder exists, whatever the code does.</summary>
    private static string DefaultFolder => Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData, Environment.SpecialFolderOption.DoNotVerify),
        "ClinicHub", "attachments");

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
    [Trait("Case", "ATT-076")]
    public void An_unknown_type_key_in_the_global_list_stops_the_app_and_the_message_names_it()
    {
        var settings = Valid();
        settings.AllowedTypes = "png,exe";

        var message = ShouldNotStart(settings).Message;

        message.ShouldContain("exe");
        message.ShouldContain("Attachments:AllowedTypes");
    }

    [Fact]
    [Trait("Case", "ATT-060")]
    [Trait("Case", "ATT-076")]
    public void An_unknown_type_key_in_a_modules_list_stops_the_app_and_the_message_names_it()
    {
        var message = ShouldNotStart(WithPaper(types: "png,svg")).Message;

        message.ShouldContain("svg");
        message.ShouldContain($"Attachments:Modules:{Paper}:AllowedTypes");
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
    [Trait("Case", "ATT-076")]
    [InlineData(0)]
    [InlineData(-1)]
    public void A_global_size_below_1_stops_the_app(int mb)
    {
        var settings = Valid();
        settings.MaxFileSizeMb = mb;

        ShouldNotStart(settings).Message.ShouldContain($"Attachments:MaxFileSizeMb is {mb}");
    }

    [Theory]
    [Trait("Case", "ATT-062")]
    [Trait("Case", "ATT-076")]
    [InlineData(0)]
    [InlineData(-1)]
    public void A_modules_size_below_1_stops_the_app(int mb)
    {
        ShouldNotStart(WithPaper(mb: mb)).Message.ShouldContain($"Attachments:Modules:{Paper}:MaxFileSizeMb is {mb}");
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
    [Trait("Case", "ATT-076")]
    public void A_modules_size_above_the_global_stops_the_app()
    {
        var message = ShouldNotStart(WithPaper(mb: 21)).Message;

        message.ShouldContain($"Attachments:Modules:{Paper}:MaxFileSizeMb is 21");
        message.ShouldContain("Attachments:MaxFileSizeMb (20)");
    }

    [Fact]
    [Trait("Case", "ATT-063")]
    public void A_modules_size_equal_to_the_global_starts()
    {
        ShouldStart(WithPaper(mb: 20));
    }

    [Fact]
    [Trait("Case", "ATT-063")]
    [Trait("Case", "ATT-076")]
    public void A_modules_known_type_outside_the_global_list_stops_the_app_and_the_message_names_it()
    {
        var message = ShouldNotStart(WithPaper(types: "png,gif")).Message;

        message.ShouldContain("gif");
        message.ShouldContain($"Attachments:Modules:{Paper}:AllowedTypes");
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

    [Fact]
    [Trait("Case", "ATT-065")]
    public void A_modules_key_with_no_value_starts_and_takes_the_global_values()
    {
        var settings = Valid();
        settings.Modules[Paper] = null;

        ShouldStart(settings);

        var rules = settings.RulesFor(Paper);
        rules.MaxFileSizeBytes.ShouldBe(20 * AttachmentSettings.BytesPerMb);
        rules.TypeKeys.ShouldBe(["png", "jpeg", "pdf"], ignoreOrder: true);
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
    [Trait("Case", "ATT-076")]
    [InlineData("attachments")]
    [InlineData("./attachments")]
    [InlineData("../attachments")]
    public void A_relative_root_stops_the_app(string relative)
    {
        ShouldNotStart(Valid(relative)).Message.ShouldContain($"{RootSetting} '{relative}' is relative");
        ShouldNotStart(Valid(relative), isDevelopment: true).Message.ShouldContain($"{RootSetting} '{relative}' is relative");
    }

    [Fact]
    [Trait("Case", "ATT-069")]
    [Trait("Case", "ATT-076")]
    public void A_root_inside_the_content_root_stops_the_app()
    {
        var inside = Path.Combine(contentRoot, "files");

        var message = ShouldNotStart(Valid(inside)).Message;

        message.ShouldContain($"{RootSetting} '{inside}'");
        message.ShouldContain("content root");
        ShouldNotStart(Valid(Path.Combine(contentRoot, "deep", "down", "files")));
    }

    [Fact]
    [Trait("Case", "ATT-069")]
    [Trait("Case", "ATT-076")]
    public void A_root_inside_the_web_root_stops_the_app()
    {
        var aWebRootOutsideTheSite = Directory.CreateDirectory(Path.Combine(sandbox, "public")).FullName;
        var inside = Path.Combine(aWebRootOutsideTheSite, "files");
        var settings = Valid(inside);

        var message = Should.Throw<InvalidOperationException>(() => settings.Validate(false, contentRoot, aWebRootOutsideTheSite)).Message;

        message.ShouldContain($"{RootSetting} '{inside}'");
        message.ShouldContain("web root");
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

    [Fact]
    [Trait("Case", "ATT-069")]
    public void A_root_differing_only_by_case_from_the_content_root_follows_the_systems_rule()
    {
        // The pure rule with both systems' arguments is ATT-070: this proves what Validate passes it on the system it runs on
        var otherCase = Path.Combine(sandbox, "SITE", "files");
        var settings = Valid(otherCase);

        if (OperatingSystem.IsWindows())
        {
            ShouldNotStart(settings);
            return;
        }

        ShouldStart(settings);
        settings.Physical.RootPath.ShouldBe(otherCase);
        Directory.Exists(otherCase).ShouldBeTrue();
    }

    [Theory]
    [Trait("Case", "ATT-071")]
    [Trait("Case", "ATT-076")]
    [InlineData("")]
    [InlineData("   ")]
    [InlineData(null)]
    public void An_empty_root_outside_development_stops_the_app(string empty)
    {
        var settings = Valid();
        settings.Physical.RootPath = empty;

        ShouldNotStart(settings).Message.ShouldContain($"{RootSetting} is empty");
    }

    [Theory]
    [Trait("Case", "ATT-071")]
    [InlineData("")]
    [InlineData("   ")]
    [InlineData(null)]
    public void An_empty_root_in_development_means_the_default_folder(string empty)
    {
        AttachmentSettings.DefaultedRoot(empty, isDevelopment: true).ShouldBe(DefaultFolder);
    }

    [Theory]
    [Trait("Case", "ATT-071")]
    [InlineData("")]
    [InlineData("   ")]
    [InlineData(null)]
    public void An_empty_root_in_development_starts_on_the_default_folder_and_creates_it(string empty)
    {
        var settings = Valid();
        settings.Physical.RootPath = empty;

        // As a Development start does, this leaves the default folder on the machine: it may be a developer's own, so it isn't removed
        ShouldStart(settings, isDevelopment: true);

        settings.Physical.RootPath.ShouldBe(DefaultFolder);
        Directory.Exists(DefaultFolder).ShouldBeTrue();
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

    // ---- Can't be written to ----

    [Fact]
    [Trait("Case", "ATT-072")]
    [Trait("Case", "ATT-076")]
    public void A_root_that_is_really_a_file_stops_the_app_and_the_message_names_it()
    {
        File.WriteAllBytes(root, [1]);

        var error = ShouldNotStart(Valid());

        error.Message.ShouldContain($"{RootSetting} '{root}' can't be created or written to");
        error.InnerException.ShouldBeAssignableTo<IOException>();
    }

    [Fact]
    [Trait("Case", "ATT-072")]
    [Trait("Case", "ATT-076")]
    public void A_folder_it_can_not_write_to_stops_the_app_and_the_message_names_it()
    {
        // Windows has no such mode, and root writes anywhere: there the folder wouldn't refuse, so this check would prove nothing
        if (OperatingSystem.IsWindows() || Environment.IsPrivilegedProcess)
            return;
        Directory.CreateDirectory(root);
        File.SetUnixFileMode(root, UnixFileMode.UserRead | UnixFileMode.UserExecute
            | UnixFileMode.GroupRead | UnixFileMode.GroupExecute | UnixFileMode.OtherRead | UnixFileMode.OtherExecute);

        var error = ShouldNotStart(Valid());

        error.Message.ShouldContain($"{RootSetting} '{root}' can't be created or written to");
        error.InnerException.ShouldBeOfType<UnauthorizedAccessException>();
        Directory.GetFileSystemEntries(root).ShouldBeEmpty();
    }

    [Fact]
    [Trait("Case", "ATT-077")]
    public void The_write_probe_leaves_the_root_empty()
    {
        ShouldStart(Valid());

        Directory.GetFileSystemEntries(root).ShouldBeEmpty();
    }
}
