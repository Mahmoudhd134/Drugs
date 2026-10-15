using System.Runtime.CompilerServices;
using ClinicHub.Application.Features.Access.Roles;
using ClinicHub.Application.Features.Access.StaffMembers.Commands.AddStaff;
using ClinicHub.Application.Features.Access.StaffMembers.Commands.UpdateStaff;
using ClinicHub.IntegrationTests.Harness.Assertions;
using ClinicHub.IntegrationTests.Harness.Hosting;

namespace ClinicHub.IntegrationTests.Harness.Builders;

/// <summary><see cref="AddStaffCommand"/> in the clinic (as the admin screen), then deactivation when asked.</summary>
public sealed class StaffBuilder(AppFixture app, ClinicHandle clinic)
{
    private string phone = Unique.Phone();
    private string fullName = Unique.Name("Staff", "موظف");
    private readonly List<int> roleIds = [];
    private bool inactive;

    /// <summary>Any phone format the app accepts; a phone that already has a user reuses it (e.g. staff of two clinics).</summary>
    public StaffBuilder WithPhone(string value)
    {
        phone = value;
        return this;
    }

    public StaffBuilder Named(string value)
    {
        fullName = value;
        return this;
    }

    /// <summary>A role of the clinic by name (<c>Owner</c>, <c>Doctor</c>, <c>Assistant</c> or a custom one); repeatable.</summary>
    public StaffBuilder WithRole(string roleName)
    {
        roleIds.Add(clinic.RoleId(roleName));
        return this;
    }

    public StaffBuilder WithRoles(params int[] ids)
    {
        roleIds.AddRange(ids);
        return this;
    }

    public StaffBuilder Inactive()
    {
        inactive = true;
        return this;
    }

    public async Task<StaffHandle> CreateAsync()
    {
        var roles = roleIds.Count > 0 ? roleIds.ToList() : [clinic.RoleId(DefaultRoles.Doctor)];
        var staff = (await app.SendAsync(new AddStaffCommand(phone, fullName, roles), clinic.Id)).ShouldSucceed();
        if (inactive)
            (await app.SendAsync(new UpdateStaffCommand(staff.Id, staff.FullName, false, roles), clinic.Id)).ShouldSucceed();
        return new StaffHandle(staff.Id, staff.UserId, clinic.Id, staff.Phone, staff.FullName);
    }

    public TaskAwaiter<StaffHandle> GetAwaiter() => CreateAsync().GetAwaiter();
}
