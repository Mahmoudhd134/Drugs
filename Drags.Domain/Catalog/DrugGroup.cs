using Drags.Domain.Common;

namespace Drags.Domain.Catalog;

public class DrugGroup : IClinicOwned, IHasTimestamps
{
    public int Id { get; set; }
    public int ClinicId { get; set; }
    public string Name { get; set; }
    public List<DrugGroupItem> Items { get; set; } = [];
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
}

public class DrugGroupItem : IClinicOwned, IHasTimestamps
{
    public int Id { get; set; }
    /// <summary>
    /// Filled from the request's clinic on insert; equals the group's clinic because saving rows of
    /// another clinic throws. Lets the clinic filter be uniform.
    /// </summary>
    public int ClinicId { get; set; }
    public int DrugGroupId { get; set; }
    public int DrugId { get; set; }
    public int Order { get; set; }
    /// <summary>Group-specific dosing; empty fields fall back to the drug's default dosing.</summary>
    public Dosing Dosing { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }

    public DrugGroup DrugGroup { get; set; }
    public Drug Drug { get; set; }
}
