using ClinicHub.Domain.Catalog;

namespace ClinicHub.Application.Features.Catalog.Protocols;

/// <summary>A line of a saved protocol; its position in the list becomes its order.</summary>
/// <param name="Dosing">The protocol's override (null = the drug's default).</param>
public record SaveProtocolItem(int DrugId, Dosing Dosing)
{
    /// <summary>At most this many lines in a protocol (validation: <c>invalidRequest</c> beyond it).</summary>
    public const int MaxItems = 1000;

    /// <summary>The non-null items, in the given order, with their dosing normalized.</summary>
    public static List<SaveProtocolItem> Normalize(List<SaveProtocolItem> items) =>
        (items ?? [])
        .Where(x => x is not null)
        .Select(x => x with { Dosing = DosingRules.Normalize(x.Dosing) })
        .ToList();

    /// <summary>
    /// For each item <see cref="Normalize"/> keeps, its index in <paramref name="items"/> as sent (nulls counted): the
    /// <c>items[i]</c> of an error about that line (<c>drugWithdrawn</c>).
    /// </summary>
    public static List<int> RequestIndexes(List<SaveProtocolItem> items) =>
        (items ?? [])
        .Select((item, index) => (item, index))
        .Where(x => x.item is not null)
        .Select(x => x.index)
        .ToList();

    /// <summary>
    /// True when two (normalized) items give the same drug for the same <b>effective</b> eye: the line's own eye, else
    /// the drug's default eye (<paramref name="defaultEyes"/>: drug id → its default eye, null = none), where no eye
    /// and "none" are the same; "ask" is an eye of its own. Like the SPA's <c>itemIdentity</c>.
    /// </summary>
    public static bool HasDuplicate(List<SaveProtocolItem> items, IReadOnlyDictionary<int, string> defaultEyes) =>
        items.Select(x => (x.DrugId, Eye: x.Dosing?.Eye ?? defaultEyes.GetValueOrDefault(x.DrugId) ?? NoEye))
            .Distinct().Count() != items.Count;

    private const string NoEye = "none";
}
