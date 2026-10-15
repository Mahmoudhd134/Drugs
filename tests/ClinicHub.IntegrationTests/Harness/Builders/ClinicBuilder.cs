using System.Runtime.CompilerServices;
using ClinicHub.Application.Features.Access.Roles.Queries.GetRoles;
using ClinicHub.Application.Features.Platform.Clinics.Commands.CreateClinic;
using ClinicHub.Application.Features.Platform.Clinics.Commands.DeleteClinic;
using ClinicHub.Application.Features.Platform.Clinics.Commands.SuspendClinic;
using ClinicHub.IntegrationTests.Harness.Assertions;
using ClinicHub.IntegrationTests.Harness.Hosting;
using Microsoft.EntityFrameworkCore;

namespace ClinicHub.IntegrationTests.Harness.Builders;

/// <summary>A created clinic: its id, name, owner and its roles' ids by name (<c>Owner</c>, <c>Doctor</c>, <c>Assistant</c>…).</summary>
public sealed record ClinicHandle(int Id, string Name, StaffHandle Owner, IReadOnlyDictionary<string, int> RoleIds)
{
    public int RoleId(string name) => RoleIds.TryGetValue(name, out var id)
        ? id
        : throw new KeyNotFoundException($"Clinic {Name} has no role '{name}' ({string.Join(", ", RoleIds.Keys)}).");
}

/// <summary>A staff member: ids, clinic, phone (E.164) and name.</summary>
public sealed record StaffHandle(int Id, int UserId, int ClinicId, string Phone, string FullName);

/// <summary><see cref="CreateClinicCommand"/> (as the admin screen), then the optional status change.</summary>
public sealed class ClinicBuilder(AppFixture app)
{
    private string name = Unique.Name("Clinic", "عيادة");
    private string ownerPhone = Unique.Phone();
    private string ownerName = Unique.Name("Owner", "المالك");
    private bool suspended;
    private bool deleted;

    public ClinicBuilder Named(string value)
    {
        name = value;
        return this;
    }

    /// <summary>The owner (any phone format the app accepts; an existing user is reused, like the admin screen).</summary>
    public ClinicBuilder OwnedBy(string phone, string fullName = null)
    {
        ownerPhone = phone;
        ownerName = fullName ?? ownerName;
        return this;
    }

    public ClinicBuilder Suspended()
    {
        suspended = true;
        return this;
    }

    /// <summary>Soft deleted after creation (suspended first too when <see cref="Suspended"/> is also called).</summary>
    public ClinicBuilder Deleted()
    {
        deleted = true;
        return this;
    }

    public async Task<ClinicHandle> CreateAsync()
    {
        var details = (await app.SendAsync(new CreateClinicCommand(name, new CreateClinicOwner(ownerPhone, ownerName))))
            .ShouldSucceed();
        var roles = (await app.SendAsync(new GetRolesQuery(), details.Id)).ShouldSucceed();
        var owner = details.Owners.Single();
        var userId = await app.QueryDbAsync(db =>
            db.Staff.IgnoreQueryFilters().Where(s => s.Id == owner.StaffId).Select(s => s.UserId).SingleAsync());

        if (suspended)
            (await app.SendAsync(new SuspendClinicCommand(details.Id))).ShouldSucceed();
        if (deleted)
            (await app.SendAsync(new DeleteClinicCommand(details.Id))).ShouldSucceed();

        return new ClinicHandle(details.Id, details.Name,
            new StaffHandle(owner.StaffId, userId, details.Id, owner.Phone, owner.FullName),
            roles.ToDictionary(r => r.Name, r => r.Id));
    }

    public TaskAwaiter<ClinicHandle> GetAwaiter() => CreateAsync().GetAwaiter();
}
