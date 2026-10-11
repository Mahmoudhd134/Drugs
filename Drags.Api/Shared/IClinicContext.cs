namespace Drags.Api.Shared;

/// <summary>
/// The clinic the current request acts in (scoped per request). Null = no clinic: clinic-owned
/// queries return nothing and saving a clinic-owned row throws.
/// </summary>
public interface IClinicContext
{
    int? ClinicId { get; }
}

/// <summary>Settable implementation, filled by the clinic resolution middleware (and the seeder).</summary>
public class ClinicContext : IClinicContext
{
    public int? ClinicId { get; set; }
}
