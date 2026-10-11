using Drags.Api.Shared;

namespace Drags.Api.Models;

/// <summary>A phone number that can log in (Identity module). Holds no personal data: names live on <see cref="Staff"/>.</summary>
public class User : IHasTimestamps
{
    public int Id { get; set; }
    /// <summary>E.164, unique.</summary>
    public string Phone { get; set; }
    /// <summary>Set only by the startup seeder, from <c>Platform:SuperAdminPhones</c>.</summary>
    public bool IsSuperAdmin { get; set; }
    public DateTime? LastLoginAt { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
}
