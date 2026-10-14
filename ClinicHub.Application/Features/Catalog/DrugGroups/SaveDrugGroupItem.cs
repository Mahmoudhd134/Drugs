using ClinicHub.Domain.Catalog;

namespace ClinicHub.Application.Features.Catalog.DrugGroups;

/// <summary>A line of a saved group; its position in the list becomes its order.</summary>
/// <param name="Dosing">The group's override (null = the drug's default).</param>
public record SaveDrugGroupItem(int DrugId, Dosing Dosing)
{
    /// <summary>The non-null items, in the given order, with their dosing normalized.</summary>
    public static List<SaveDrugGroupItem> Normalize(List<SaveDrugGroupItem> items) =>
        (items ?? [])
        .Where(x => x is not null)
        .Select(x => x with { Dosing = DosingRules.Normalize(x.Dosing) })
        .ToList();
}
