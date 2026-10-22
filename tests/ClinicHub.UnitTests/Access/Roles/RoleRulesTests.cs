using ClinicHub.Application.Features.Access.Roles;
using ClinicHub.Domain.Access;
using ClinicHub.UnitTests.TestSupport;
using Shouldly;

namespace ClinicHub.UnitTests.Access.Roles;

/// <summary>
/// <c>RoleRules</c> (platform-admin tech § roles/staff screens, access tech § Backend): the Owner-label refusal, the
/// case-insensitive name match and the permissions stored with their requirements.
/// </summary>
[Trait("Area", "admin")]
public class RoleRulesTests
{
    [Theory]
    [Trait("Case", "ADM-268")]
    [Trait("Tier", "Smoke")]
    [InlineData("Owner")]
    [InlineData(" owner ")]
    [InlineData("OWNER")]
    [InlineData("المالك")]
    [InlineData("المالك" + Text.RightToLeftMark)]
    [InlineData("الم" + Text.Tatweel + "الك")]
    [InlineData("المال" + Text.Kasra + "ك")]
    [InlineData("الم" + Text.SuperscriptAlef + "لك")]
    public void Names_that_read_like_the_owner_label_are_caught(string name)
    {
        RoleRules.IsOwnerLabel(name).ShouldBeTrue($"«{name}» reads like the Owner label");
    }

    [Theory]
    [Trait("Case", "ADM-268")]
    [InlineData("مالك")]
    [InlineData("Owners")]
    [InlineData("The Owner")]
    [InlineData("Doctor")]
    [InlineData("قراءة فقط")]
    public void Other_names_are_not_the_owner_label(string name)
    {
        RoleRules.IsOwnerLabel(name).ShouldBeFalse($"«{name}»");
    }

    [Theory]
    [InlineData("Ow" + Text.ZeroWidthSpace + "ner")]
    [InlineData(Text.LeftToRightMark + "Owner")]
    [InlineData("المالك" + Text.ByteOrderMark)]
    [InlineData("ال" + Text.ZeroWidthJoiner + "مالك")]
    [InlineData("المالك" + Text.SoftHyphen)]
    [InlineData("المـــالك")]
    [InlineData("المَالِكُ")]
    [InlineData("المالكّ")] // shadda
    public void Invisible_format_characters_marks_and_tatweel_are_ignored(string name)
    {
        // RoleRules.WithoutInvisibleMarks: Cf, Mn and the tatweel are dropped (catalog ADM-265 at the API level)
        RoleRules.IsOwnerLabel(name).ShouldBeTrue();
    }

    [Fact]
    public void Look_alike_letters_of_another_script_are_not_caught()
    {
        // Accepted limit (RoleRules, catalog ADM-267): a Cyrillic "О" passes
        RoleRules.IsOwnerLabel("Оwner").ShouldBeFalse();
    }

    [Theory]
    [InlineData("الم" + Text.SuperscriptAlef + "لك", "المالك")]
    [InlineData("A" + Text.RightToLeftMark + "B" + Text.ZeroWidthSpace + "C", "ABC")]
    [InlineData("كـتاب", "كتاب")]
    [InlineData("كِتَابٌ", "كتاب")]
    [InlineData("Café", "Café")]
    [InlineData("Café", "Cafe")]
    [InlineData("  spaces stay  ", "  spaces stay  ")]
    public void Without_invisible_marks_keeps_what_reads(string name, string expected)
    {
        RoleRules.WithoutInvisibleMarks(name).ShouldBe(expected);
    }

    [Fact]
    public void The_owner_labels_are_english_and_arabic()
    {
        DefaultRoles.OwnerLabels.ShouldBe(["Owner", "المالك"]);
    }

    [Theory]
    [InlineData("doctor")]
    [InlineData("DOCTOR")]
    [InlineData("Doctor")]
    public void With_name_matches_case_insensitively(string name)
    {
        var roles = new List<Role> { new() { Id = 1, Name = "Doctor" }, new() { Id = 2, Name = "Assistant" } }.AsQueryable();

        roles.WithName(name).Select(r => r.Id).ShouldBe([1]);
    }

    [Fact]
    public void With_name_matches_the_whole_name_only()
    {
        var roles = new List<Role> { new() { Id = 1, Name = "Doctor Plus" }, new() { Id = 2, Name = "قراءة فقط" } }.AsQueryable();

        roles.WithName("Doctor").ShouldBeEmpty();
        roles.WithName("قراءة فقط").Select(r => r.Id).ShouldBe([2]);
    }

    [Fact]
    public void With_ids_picks_those_roles()
    {
        var roles = new List<Role> { new() { Id = 1 }, new() { Id = 2 }, new() { Id = 3 } }.AsQueryable();

        roles.WithIds([3, 1, 3]).Select(r => r.Id).ShouldBe([1, 3], ignoreOrder: true);
        roles.WithIds([]).ShouldBeEmpty();
    }

    [Fact]
    public void Set_permissions_stores_the_picked_keys_with_their_requirements()
    {
        var role = new Role();

        RoleRules.SetPermissions(role, ["drugs.update"]).ShouldBeTrue();

        role.Permissions.Select(p => p.Permission).ShouldBe(["drugs.update", "drugs.details", "drugs.list"], ignoreOrder: true);
    }

    [Fact]
    public void Set_permissions_replaces_the_old_keys_and_keeps_the_unchanged_rows()
    {
        var kept = new RolePermission { RoleId = 5, Permission = "drugs.list" };
        var role = new Role { Id = 5, Permissions = [kept, new RolePermission { RoleId = 5, Permission = "drugs.delete" }] };

        RoleRules.SetPermissions(role, ["protocols.update"]).ShouldBeTrue();

        role.Permissions.Select(p => p.Permission)
            .ShouldBe(["drugs.list", "protocols.update", "protocols.details", "protocols.list"], ignoreOrder: true);
        role.Permissions.ShouldContain(kept, "the unchanged row is the same row");
    }

    [Fact]
    public void Set_permissions_with_the_same_keys_changes_nothing()
    {
        var role = new Role();
        RoleRules.SetPermissions(role, ["drugs.update"]);
        var rows = role.Permissions.ToList();

        RoleRules.SetPermissions(role, ["drugs.details", "drugs.update", "drugs.list"]).ShouldBeFalse();
        RoleRules.SetPermissions(role, ["drugs.update", "drugs.update"]).ShouldBeFalse();

        role.Permissions.ShouldBe(rows);
    }

    [Fact]
    public void Set_permissions_can_only_remove_or_only_add()
    {
        var role = new Role();
        RoleRules.SetPermissions(role, ["drugs.update"]);

        RoleRules.SetPermissions(role, ["drugs.details"]).ShouldBeTrue("drugs.update removed");
        role.Permissions.Select(p => p.Permission).ShouldBe(["drugs.details", "drugs.list"], ignoreOrder: true);

        RoleRules.SetPermissions(role, ["drugs.details", "drugs.create"]).ShouldBeTrue("drugs.create added");
        role.Permissions.Select(p => p.Permission).ShouldBe(["drugs.details", "drugs.list", "drugs.create"], ignoreOrder: true);
    }

    [Fact]
    public void Set_permissions_with_nothing_empties_the_role()
    {
        var role = new Role();
        RoleRules.SetPermissions(role, ["protocols.delete"]);

        RoleRules.SetPermissions(role, []).ShouldBeTrue();
        role.Permissions.ShouldBeEmpty();
        RoleRules.SetPermissions(role, []).ShouldBeFalse();
    }
}
