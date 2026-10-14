using Drags.Api.Features.Drugs;
using Drags.Domain.Catalog;

namespace Drags.Api.Features.DrugGroups;

/// <summary>
/// A drug in a group with the group's dosing override. Empty override fields mean
/// "use the drug's default"; the eye may be "ask" (chosen when the group is added).
/// </summary>
public record DrugGroupItemDto(DrugDto Drug, Dosing Dosing);

/// <summary>A group with its items in order.</summary>
public record DrugGroupDto(int Id, string Name, List<DrugGroupItemDto> Items);

public record SaveDrugGroupItem(int DrugId, Dosing Dosing);

public record SaveDrugGroupRequest(string Name, List<SaveDrugGroupItem> Items);

public static class DrugGroupMappings
{
    public static DrugGroupDto ToDto(this DrugGroup group) => new(
        group.Id,
        group.Name,
        group.Items
            .OrderBy(x => x.Order)
            .Select(x => new DrugGroupItemDto(x.Drug.ToDto(), x.Dosing))
            .ToList());

    /// <summary>Normalizes each item's dosing, keeping the given order.</summary>
    public static List<SaveDrugGroupItem> Normalize(this IEnumerable<SaveDrugGroupItem> items) =>
        (items ?? [])
        .Where(x => x is not null)
        .Select(x => x with { Dosing = DosingRules.Normalize(x.Dosing) })
        .ToList();
}
