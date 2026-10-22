namespace ClinicHub.Application.Common.Abstractions;

/// <summary>
/// The clinic the current request acts in (scoped per request). Null = no clinic: clinic-owned
/// queries return nothing (shared drugs only, design M1.7 D1) and saving a clinic-owned row throws.
/// </summary>
public interface IClinicContext
{
    int? ClinicId { get; }

    /// <summary>
    /// True only inside <see cref="IClinicScope.UseSharedCatalog"/> (design M1.7 D2): the save interceptor then lets a
    /// request with no clinic add or modify shared drugs (never delete them). Never true while a clinic is set.
    /// </summary>
    bool WritingSharedCatalog { get; }
}

/// <summary>Settable implementation, filled by the clinic resolution middleware (and the seeder).</summary>
public class ClinicContext : IClinicContext
{
    public int? ClinicId { get; set; }

    /// <inheritdoc />
    public bool WritingSharedCatalog { get; set; }
}
