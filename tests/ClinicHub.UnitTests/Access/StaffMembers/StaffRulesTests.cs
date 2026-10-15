using ClinicHub.Application.Features.Access.StaffMembers;
using ClinicHub.Domain.Access;
using Shouldly;

namespace ClinicHub.UnitTests.Access.StaffMembers;

/// <summary>
/// The <c>lastOwner</c> rule's pure half (platform-admin tech § staff): an active Owner today who would stop being one,
/// and the active-owners query piece.
/// </summary>
[Trait("Area", "admin")]
public class StaffRulesTests
{
    private static readonly Role OwnerRole = new() { Id = 1, Name = "Owner", IsOwner = true };
    private static readonly Role DoctorRole = new() { Id = 2, Name = "Doctor" };

    private static Staff Member(int id, bool active, params Role[] roles) => new()
    {
        Id = id, IsActive = active, Roles = roles.Select(r => new StaffRole { StaffId = id, RoleId = r.Id, Role = r }).ToList(),
    };

    [Fact]
    public void An_active_owner_who_stops_being_one_is_caught()
    {
        StaffRules.StopsBeingActiveOwner(Member(1, true, OwnerRole), staysActiveOwner: false).ShouldBeTrue();
        StaffRules.StopsBeingActiveOwner(Member(1, true, DoctorRole, OwnerRole), staysActiveOwner: false).ShouldBeTrue();
    }

    [Fact]
    public void An_active_owner_who_stays_one_is_not()
    {
        StaffRules.StopsBeingActiveOwner(Member(1, true, OwnerRole), staysActiveOwner: true).ShouldBeFalse();
    }

    [Fact]
    public void Someone_who_is_not_an_active_owner_today_never_is()
    {
        StaffRules.StopsBeingActiveOwner(Member(1, false, OwnerRole), staysActiveOwner: false).ShouldBeFalse("inactive owner");
        StaffRules.StopsBeingActiveOwner(Member(1, true, DoctorRole), staysActiveOwner: false).ShouldBeFalse("not an owner");
        StaffRules.StopsBeingActiveOwner(Member(1, true), staysActiveOwner: false).ShouldBeFalse("no role");
    }

    [Fact]
    public void Active_owners_are_the_active_staff_holding_the_owner_role()
    {
        var staff = new List<Staff>
        {
            Member(1, true, OwnerRole),
            Member(2, false, OwnerRole),
            Member(3, true, DoctorRole),
            Member(4, true, DoctorRole, OwnerRole),
            Member(5, true),
        }.AsQueryable();

        staff.ActiveOwners().Select(s => s.Id).ShouldBe([1, 4]);
    }

    [Fact]
    public void With_roles_keeps_every_staff_member()
    {
        var staff = new List<Staff> { Member(1, true, OwnerRole), Member(2, false) }.AsQueryable();

        staff.WithRoles().Select(s => s.Id).ShouldBe([1, 2]);
    }
}
