using ClinicHub.Domain.Catalog;

namespace ClinicHub.Application.Features.Catalog.DrugGroups;

/// <summary>A line of a saved group; its position in the list becomes its order.</summary>
/// <param name="Dosing">The group's override (null = the drug's default).</param>
public record SaveDrugGroupItem(int DrugId, Dosing Dosing)
{
    /// <summary>At most this many lines in a group (validation: <c>invalidRequest</c> beyond it).</summary>
    public const int MaxItems = 1000;

    /// <summary>The non-null items, in the given order, with their dosing normalized.</summary>
    public static List<SaveDrugGroupItem> Normalize(List<SaveDrugGroupItem> items) =>
        (items ?? [])
        .Where(x => x is not null)
        .Select(x => x with { Dosing = DosingRules.Normalize(x.Dosing) })
        .ToList();

    /// <summary>
    /// True when two (normalized) items give the same drug for the same <b>effective</b> eye: the line's own eye, else
    /// the drug's default eye (<paramref name="defaultEyes"/>: drug id → its default eye, null = none), where no eye
    /// and "none" are the same; "ask" is an eye of its own. Like the SPA's <c>itemIdentity</c>.
    /// </summary>
    public static bool HasDuplicate(List<SaveDrugGroupItem> items, IReadOnlyDictionary<int, string> defaultEyes) =>
        items.Select(x => (x.DrugId, Eye: x.Dosing?.Eye ?? defaultEyes.GetValueOrDefault(x.DrugId) ?? NoEye))
            .Distinct().Count() != items.Count;

    private const string NoEye = "none";
}
