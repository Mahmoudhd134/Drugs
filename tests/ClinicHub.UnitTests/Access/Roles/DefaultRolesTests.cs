using ClinicHub.Application.Features.Access.Authorization;
using ClinicHub.Application.Features.Access.Roles;
using Shouldly;

namespace ClinicHub.UnitTests.Access.Roles;

/// <summary>
/// The roles every clinic starts with (access tech § Backend, access business § الأدوار الافتراضية): Owner (every
/// permission, no rows), Doctor (all), Assistant (all but the two deletes).
/// </summary>
[Trait("Area", "access")]
public class DefaultRolesTests
{
    [Fact]
    public void Every_clinic_starts_with_owner_doctor_and_assistant()
    {
        DefaultRoles.Templates.Select(t => t.Name).ShouldBe(["Owner", "Doctor", "Assistant"]);
    }

    [Fact]
    public void Owner_has_no_rows_it_gets_every_permission()
    {
        DefaultRoles.Templates.Single(t => t.Name == DefaultRoles.Owner).Permissions.ShouldBeNull();
    }

    [Fact]
    public void Doctor_has_all_11_permissions()
    {
        DefaultRoles.Templates.Single(t => t.Name == DefaultRoles.Doctor).Permissions
            .ShouldBe(PermissionCatalog.All.Select(p => p.Key).ToList());
    }

    [Fact]
    public void Assistant_has_all_but_the_deletes()
    {
        var assistant = DefaultRoles.Templates.Single(t => t.Name == DefaultRoles.Assistant).Permissions;

        assistant.Count.ShouldBe(9);
        assistant.ShouldNotContain("drugs.delete");
        assistant.ShouldNotContain("groups.delete");
        PermissionCatalog.WithRequirements(assistant).Count.ShouldBe(9, "nothing missing that it needs");
    }
}
