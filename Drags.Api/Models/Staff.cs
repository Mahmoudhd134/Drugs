using Drags.Api.Shared;

namespace Drags.Api.Models;

/// <summary>
/// A user's membership in one clinic (Access module). Phase 2 only needs it to know which clinics a
/// user can enter; roles come with phase 3.
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
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
}
