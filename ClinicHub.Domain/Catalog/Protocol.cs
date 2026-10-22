using ClinicHub.Domain.Common;

namespace ClinicHub.Domain.Catalog;

public class Protocol : IClinicOwned, IHasTimestamps
{
    public int Id { get; set; }
    public int ClinicId { get; set; }
    public string Name { get; set; }
    public List<ProtocolItem> Items { get; set; } = [];
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
}

public class ProtocolItem : IClinicOwned, IHasTimestamps
{
    public int Id { get; set; }
    /// <summary>
    /// Filled from the request's clinic on insert; equals the protocol's clinic because saving rows of
    /// another clinic throws. Lets the clinic filter be uniform.
    /// </summary>
    public int ClinicId { get; set; }
    public int ProtocolId { get; set; }
    public int DrugId { get; set; }
    public int Order { get; set; }
    /// <summary>Protocol-specific dosing; empty fields fall back to the drug's default dosing.</summary>
    public Dosing Dosing { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }

    public Protocol Protocol { get; set; }
    public Drug Drug { get; set; }
}
