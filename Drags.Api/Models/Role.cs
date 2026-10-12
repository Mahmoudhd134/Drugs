using Drags.Api.Shared;

namespace Drags.Api.Models;

/// <summary>
/// A clinic's named set of permissions (Access module). The Owner role (<see cref="IsOwner"/>, one
/// per clinic) has every permission implicitly and no <see cref="Permissions"/> rows.
/// </summary>
public class Role : IClinicOwned, IHasTimestamps
{
    public int Id { get; set; }
    public int ClinicId { get; set; }
    public string Name { get; set; }
    public bool IsOwner { get; set; }
    public List<RolePermission> Permissions { get; set; } = [];
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
}

/// <summary>
/// One permission key of a role (a value of <c>Features.Access.Permissions</c>). Not clinic-owned: it
/// is only reached through its (filtered) role, so there is deliberately no DbSet.
/// </summary>
public class RolePermission
{
    public int RoleId { get; set; }
    public string Permission { get; set; }
}

/// <summary>
/// A role given to a staff member. Composite FKs with <see cref="ClinicId"/> make the database reject
/// a role of another clinic.
/// </summary>
public class StaffRole : IClinicOwned
{
    public int StaffId { get; set; }
    public int RoleId { get; set; }
    public int ClinicId { get; set; }
    public Staff Staff { get; set; }
    public Role Role { get; set; }
}
