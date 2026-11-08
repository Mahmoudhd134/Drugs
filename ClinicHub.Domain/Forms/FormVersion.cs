using ClinicHub.Domain.Common;

namespace ClinicHub.Domain.Forms;

/// <summary>One version of a form's definition. The primary key is (<see cref="FormId"/>, <see cref="VersionNumber"/>).</summary>
public class FormVersion : IHasTimestamps
{
    public int FormId { get; set; }
    /// <summary>From 1.</summary>
    public int VersionNumber { get; set; }
    /// <summary>The form's JSON as sent; nothing queries inside it.</summary>
    public string Definition { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
}
