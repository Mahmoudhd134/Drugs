using ClinicHub.Application.Features.Access.Roles;
using ClinicHub.Application.Features.Access.Roles.Commands.DeleteRole;
using ClinicHub.Application.Features.Access.Roles.Commands.UpdateRole;
using ClinicHub.Application.Features.Access.StaffMembers;
using ClinicHub.Application.Features.Access.StaffMembers.Commands.RemoveStaff;
using ClinicHub.Application.Features.Access.StaffMembers.Commands.UpdateStaff;
using ClinicHub.Application.Features.Catalog.DrugGroups;
using ClinicHub.Application.Features.Catalog.DrugGroups.Commands.DeleteDrugGroup;
using ClinicHub.Application.Features.Catalog.DrugGroups.Commands.UpdateDrugGroup;
using ClinicHub.Application.Features.Catalog.Drugs;
using ClinicHub.Application.Features.Catalog.Drugs.Commands.DeleteDrug;
using ClinicHub.Application.Features.Catalog.Drugs.Commands.UpdateDrug;
using ClinicHub.Application.Features.Platform.Clinics;
using ClinicHub.Application.Features.Platform.Clinics.Commands.ActivateClinic;
using ClinicHub.Application.Features.Platform.Clinics.Commands.DeleteClinic;
using ClinicHub.Application.Features.Platform.Clinics.Commands.RenameClinic;
using ClinicHub.Application.Features.Platform.Clinics.Commands.SuspendClinic;
using ClinicHub.Domain.Catalog;
using ClinicHub.IntegrationTests.Harness.Assertions;
using ClinicHub.IntegrationTests.Harness.Hosting;
using Microsoft.EntityFrameworkCore;

namespace ClinicHub.IntegrationTests.Harness.Builders;

/// <summary>
/// Test data through the real use cases (design D3): every builder sends the app's own command through MediatR in a
/// DI scope acting in the right clinic (<see cref="AppFixture.SendAsync{TResult}"/>): validation, transaction,
/// provisioning and the post-commit cache invalidation run as in production; no HTTP session, OTP code or extra staff
/// row is created, so the data is exactly what the test asks for. A failing use case fails the test (with its codes).
/// <para>
/// Builders are awaited directly (<c>var clinic = await Data.Clinic().Named("A");</c>); every value has a unique
/// default. To test a use case's own answers (validation codes…), call the API in the test instead.
/// </para>
/// </summary>
public sealed class TestData(AppFixture app)
{
    // ---- Clinics (super admin use cases) ----

    /// <summary>A clinic provisioned from the template (default roles, owner, the template's drugs and groups).</summary>
    public ClinicBuilder Clinic() => new(app);

    public async Task<ClinicDetails> RenameClinicAsync(ClinicHandle clinic, string name) =>
        (await app.SendAsync(new RenameClinicCommand(clinic.Id, name))).ShouldSucceed();

    public async Task SuspendClinicAsync(ClinicHandle clinic) => (await app.SendAsync(new SuspendClinicCommand(clinic.Id))).ShouldSucceed();

    public async Task ActivateClinicAsync(ClinicHandle clinic) => (await app.SendAsync(new ActivateClinicCommand(clinic.Id))).ShouldSucceed();

    /// <summary>Soft delete (final).</summary>
    public async Task DeleteClinicAsync(ClinicHandle clinic) => (await app.SendAsync(new DeleteClinicCommand(clinic.Id))).ShouldSucceed();

    // ---- Staff and roles (in a clinic) ----

    /// <summary>A staff member (default: a new phone, a unique name, the Doctor role, active).</summary>
    public StaffBuilder Staff(ClinicHandle clinic) => new(app, clinic);

    /// <summary>A custom role (default: a unique name, <c>drugs.list</c>).</summary>
    public RoleBuilder Role(ClinicHandle clinic) => new(app, clinic);

    /// <summary>Full update; null arguments keep the current value (name, active flag, roles).</summary>
    public async Task<StaffMemberDto> UpdateStaffAsync(StaffHandle staff, string fullName = null, bool? isActive = null,
        IEnumerable<int> roleIds = null)
    {
        var current = await app.QueryDbAsync(db => db.Staff.IgnoreQueryFilters()
            .Where(s => s.Id == staff.Id)
            .Select(s => new { s.FullName, s.IsActive, RoleIds = s.Roles.Select(r => r.RoleId).ToList() })
            .SingleAsync());
        var command = new UpdateStaffCommand(staff.Id, fullName ?? current.FullName, isActive ?? current.IsActive,
            (roleIds ?? current.RoleIds).ToList());
        return (await app.SendAsync(command, staff.ClinicId)).ShouldSucceed();
    }

    public Task<StaffMemberDto> DeactivateStaffAsync(StaffHandle staff) => UpdateStaffAsync(staff, isActive: false);

    public Task<StaffMemberDto> ActivateStaffAsync(StaffHandle staff) => UpdateStaffAsync(staff, isActive: true);

    /// <summary>Removes the staff member (real delete).</summary>
    public async Task RemoveStaffAsync(StaffHandle staff) =>
        (await app.SendAsync(new RemoveStaffCommand(staff.Id), staff.ClinicId)).ShouldSucceed();

    public async Task<RoleDto> UpdateRoleAsync(ClinicHandle clinic, int roleId, string name, params string[] permissions) =>
        (await app.SendAsync(new UpdateRoleCommand(roleId, name, permissions.ToList()), clinic.Id)).ShouldSucceed();

    public async Task DeleteRoleAsync(ClinicHandle clinic, int roleId) =>
        (await app.SendAsync(new DeleteRoleCommand(roleId), clinic.Id)).ShouldSucceed();

    // ---- Catalog (in a clinic, or the template: clinicId = await app.TemplateClinicIdAsync()) ----

    /// <summary>A drug (default: a unique name, no description, no dosing).</summary>
    public DrugBuilder Drug(int clinicId) => new(app, clinicId);

    public DrugBuilder Drug(ClinicHandle clinic) => Drug(clinic.Id);

    /// <summary>
    /// A group (default: a unique name and one line with a new default drug of the clinic; lines added with
    /// <see cref="GroupBuilder.With(int, Dosing)"/> replace that default).
    /// </summary>
    public GroupBuilder Group(int clinicId) => new(app, clinicId);

    public GroupBuilder Group(ClinicHandle clinic) => Group(clinic.Id);

    public async Task<DrugDto> UpdateDrugAsync(int clinicId, int drugId, string name, string description = null, Dosing dosing = null) =>
        (await app.SendAsync(new UpdateDrugCommand(drugId, name, description, dosing), clinicId)).ShouldSucceed();

    public async Task DeleteDrugAsync(int clinicId, int drugId) =>
        (await app.SendAsync(new DeleteDrugCommand(drugId), clinicId)).ShouldSucceed();

    public async Task<DrugGroupDto> UpdateGroupAsync(int clinicId, int groupId, string name, params SaveDrugGroupItem[] items) =>
        (await app.SendAsync(new UpdateDrugGroupCommand(groupId, name, items.ToList()), clinicId)).ShouldSucceed();

    public async Task DeleteGroupAsync(int clinicId, int groupId) =>
        (await app.SendAsync(new DeleteDrugGroupCommand(groupId), clinicId)).ShouldSucceed();
}
