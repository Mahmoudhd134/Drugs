using ClinicHub.Application.Common.Settings;
using Shouldly;

namespace ClinicHub.UnitTests.Attachments.Settings;

/// <summary>
/// The root path rule as a pure function, so the production OS's rules are proved on Linux CI (docs/design/attachments.md § 5, § 8):
/// <c>\</c> and ignoreCase are Windows, <c>/</c> and exact case are Linux.
/// </summary>
[Trait("Area", "attachments")]
public class AttachmentRootRuleTests
{
    private const string ContentRoot = @"C:\inetpub\ClinicHub";

    private static bool OnWindows(string candidate, string parent = ContentRoot) =>
        AttachmentRootRule.IsSameOrInside(candidate, parent, '\\', ignoreCase: true);

    private static bool OnLinux(string candidate, string parent) =>
        AttachmentRootRule.IsSameOrInside(candidate, parent, '/', ignoreCase: false);

    [Theory]
    [Trait("Case", "ATT-070")]
    [InlineData(@"C:\inetpub\ClinicHubFiles")]
    [InlineData(@"C:\inetpub\ClinicHub2\files")]
    [InlineData(@"C:\inetpub\ClinicHub.old")]
    [InlineData(@"C:\inetpub")]
    [InlineData(@"C:\inetpub\Other")]
    [InlineData(@"D:\inetpub\ClinicHub")]
    public void A_folder_that_only_shares_a_prefix_or_is_elsewhere_is_not_inside(string candidate)
    {
        OnWindows(candidate).ShouldBeFalse();
    }

    [Theory]
    [Trait("Case", "ATT-070")]
    [InlineData(@"C:\inetpub\ClinicHub\files")]
    [InlineData(@"C:\inetpub\ClinicHub\a\b\c")]
    public void A_real_child_at_any_depth_is_inside(string candidate)
    {
        OnWindows(candidate).ShouldBeTrue();
    }

    [Theory]
    [Trait("Case", "ATT-070")]
    [InlineData(@"C:\inetpub\Other\..\ClinicHub\files", true)]
    [InlineData(@"C:\inetpub\ClinicHub\.\files", true)]
    [InlineData(@"C:\inetpub\.\ClinicHub\files", true)]
    [InlineData(@"C:\inetpub\ClinicHub\files\..\..\Other", false)]
    [InlineData(@"C:\inetpub\ClinicHub\..\ClinicHubFiles", false)]
    public void Dot_and_dot_dot_are_resolved_first(string candidate, bool expected)
    {
        OnWindows(candidate).ShouldBe(expected);
    }

    [Theory]
    [Trait("Case", "ATT-070")]
    [InlineData(@"C:\..\inetpub\ClinicHub\files")]
    [InlineData(@"C:\..\..\inetpub\ClinicHub\files")]
    [InlineData(@"C:\a:\..\inetpub\ClinicHub\files")]
    public void On_windows_dot_dot_above_the_drive_stays_at_the_drive(string candidate)
    {
        OnWindows(candidate).ShouldBeTrue();
    }

    [Theory]
    [Trait("Case", "ATT-070")]
    [InlineData("/../srv/ClinicHub/files")]
    [InlineData("/../../srv/ClinicHub/files")]
    [InlineData("/C:/../srv/ClinicHub/files")]
    public void On_linux_dot_dot_above_the_root_stays_at_the_root_and_a_colon_makes_no_drive(string candidate)
    {
        OnLinux(candidate, "/srv/ClinicHub").ShouldBeTrue();
    }

    [Theory]
    [Trait("Case", "ATT-070")]
    [InlineData(@"c:\INETPUB\clinichub\Files")]
    [InlineData(@"C:\INETPUB\CLINICHUB")]
    public void On_windows_the_case_does_not_count(string candidate)
    {
        OnWindows(candidate).ShouldBeTrue();
    }

    [Fact]
    [Trait("Case", "ATT-070")]
    public void With_the_exact_case_rule_another_case_is_another_folder()
    {
        AttachmentRootRule.IsSameOrInside(@"c:\inetpub\clinichub\files", ContentRoot, '\\', ignoreCase: false).ShouldBeFalse();
        OnLinux("/srv/clinichub/files", "/srv/ClinicHub").ShouldBeFalse();
        OnLinux("/srv/ClinicHub/files", "/srv/ClinicHub").ShouldBeTrue();
    }

    [Theory]
    [Trait("Case", "ATT-070")]
    [InlineData(@"C:/inetpub/ClinicHub/files", true)]
    [InlineData(@"C:\inetpub/ClinicHub\files", true)]
    [InlineData(@"C:/inetpub/ClinicHubFiles", false)]
    public void On_windows_a_forward_slash_separates_too(string candidate, bool expected)
    {
        OnWindows(candidate).ShouldBe(expected);
    }

    [Fact]
    [Trait("Case", "ATT-070")]
    public void On_linux_a_backslash_is_an_ordinary_character()
    {
        OnLinux(@"/srv/ClinicHub\files", "/srv/ClinicHub").ShouldBeFalse();
        OnLinux("/srv/ClinicHubFiles", "/srv/ClinicHub").ShouldBeFalse();
        OnLinux("/srv/other/../ClinicHub/files", "/srv/ClinicHub").ShouldBeTrue();
    }

    [Theory]
    [Trait("Case", "ATT-073")]
    [InlineData(@"C:\inetpub\ClinicHub")]
    [InlineData(@"C:\inetpub\ClinicHub\")]
    [InlineData(@"C:\inetpub\ClinicHub\\")]
    [InlineData(@"C:\inetpub\ClinicHub/")]
    public void The_same_folder_counts_with_or_without_a_trailing_separator(string candidate)
    {
        OnWindows(candidate).ShouldBeTrue();
    }

    [Fact]
    [Trait("Case", "ATT-073")]
    public void A_parent_with_a_trailing_separator_is_judged_the_same()
    {
        OnWindows(@"C:\inetpub\ClinicHub", @"C:\inetpub\ClinicHub\").ShouldBeTrue();
        OnWindows(@"C:\inetpub\ClinicHub\files", @"C:\inetpub\ClinicHub\").ShouldBeTrue();
        OnWindows(@"C:\inetpub\ClinicHubFiles\", @"C:\inetpub\ClinicHub\").ShouldBeFalse();
        OnLinux("/srv/ClinicHub/", "/srv/ClinicHub").ShouldBeTrue();
        OnLinux("/srv/ClinicHub", "/srv/ClinicHub/").ShouldBeTrue();
        OnLinux("/srv/ClinicHubFiles/", "/srv/ClinicHub/").ShouldBeFalse();
    }
}
