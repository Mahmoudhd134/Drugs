using Drags.Api.Shared;

namespace Drags.Api.Models;

/// <summary>
/// A user's membership in one clinic (Access module): which clinics a user can enter, and with which
/// <see cref="Roles"/> (their permissions are the union).
/// </summary>
public class Staff : IClinicOwned, IHasTimestamps
{
    public int Id { get; set; }
    public int ClinicId { get; set; }
    public int UserId { get; set; }
    public User User { get; set; }
    public string FullName { get; set; }
    /// <summary>Inactive staff cannot enter the clinic.</summary>
    public bool IsActive { get; set; } = true;
    public List<StaffRole> Roles { get; set; } = [];
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
}
