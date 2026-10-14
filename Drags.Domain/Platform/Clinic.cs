using Drags.Domain.Common;

namespace Drags.Domain.Platform;

/// <summary>A clinic: the unit of data ownership (Platform module).</summary>
public class Clinic : IHasTimestamps
{
    public int Id { get; set; }
    public string Name { get; set; }
    /// <summary>One of <see cref="ClinicStatus"/>.</summary>
    public string Status { get; set; } = ClinicStatus.Active;
    /// <summary>The hidden clinic holding the default drugs/groups copied to new clinics (only one).</summary>
    public bool IsTemplate { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
}

public static class ClinicStatus
{
    public const string Active = "active";
    public const string Suspended = "suspended";
}
