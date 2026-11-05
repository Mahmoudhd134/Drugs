using ClinicHub.Domain.Common;

namespace ClinicHub.Domain.Prescriptions;

/// <summary>
/// A clinic's print layout (design prescription-templates D2, D4): one per clinic, the layout kept as JSON in a text
/// column. Written only from the validated DTO (<c>SavePrescriptionTemplateCommand</c>).
/// </summary>
public class PrescriptionTemplate : IClinicOwned, IHasTimestamps
{
    public int Id { get; set; }
    public int ClinicId { get; set; }
    /// <summary>The layout as JSON (<c>{ schemaVersion, page, items }</c>).</summary>
    public string Layout { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
}
