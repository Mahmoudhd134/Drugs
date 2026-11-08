using ClinicHub.Domain.Common;

namespace ClinicHub.Domain.Forms;

/// <summary>A form the super admin built (platform row, no clinic). Its content lives in its <see cref="FormVersion"/>s.</summary>
public class Form : IHasTimestamps
{
    public int Id { get; set; }
    public string Name { get; set; }
    /// <summary>Exactly one active version: a required column, proved to exist by a deferrable foreign key (design D7).</summary>
    public int ActiveVersionNumber { get; set; }
    public bool IsDeleted { get; private set; }
    public DateTime? DeletedAt { get; private set; }
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }

    public List<FormVersion> Versions { get; set; } = [];

    /// <summary>The one place that soft deletes: both fields together (design D8). A form already deleted keeps its first time.</summary>
    public void Delete(DateTime now)
    {
        if (IsDeleted)
            return;
        IsDeleted = true;
        DeletedAt = now;
    }
}
