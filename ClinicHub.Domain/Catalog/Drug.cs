using ClinicHub.Domain.Common;

namespace ClinicHub.Domain.Catalog;

public class Drug : IClinicOwned, IHasTimestamps
{
    public int Id { get; set; }
    public int ClinicId { get; set; }
    public string Name { get; set; }
    public string Description { get; set; }
    /// <summary>Dosing used when the drug is added to a prescription (null = none).</summary>
    public Dosing DefaultDosing { get; set; }
    public List<DrugGroupItem> GroupItems { get; set; } = [];
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
}
