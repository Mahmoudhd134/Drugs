using ClinicHub.Application.Features.Catalog.Drugs;
using ClinicHub.Domain.Catalog;
using Microsoft.EntityFrameworkCore;

namespace ClinicHub.Application.Features.Catalog.DrugGroups;

/// <summary>
/// A drug in a group with the group's dosing override. Empty override fields mean
/// "use the drug's default"; the eye may be "ask" (chosen when the group is added).
/// </summary>
public record DrugGroupItemDto(DrugDto Drug, Dosing Dosing);

/// <summary>A group with its items in order.</summary>
public record DrugGroupDto(int Id, string Name, List<DrugGroupItemDto> Items);

public static class DrugGroupMappings
{
    /// <summary>Needs the items and their drugs loaded (<see cref="WithItems"/>).</summary>
    public static DrugGroupDto ToDto(this DrugGroup group) => new(
        group.Id,
        group.Name,
        group.Items
            .OrderBy(x => x.Order)
            .Select(x => new DrugGroupItemDto(x.Drug.ToDto(), x.Dosing))
            .ToList());

    /// <summary>Loads each group's items and their drugs, as <see cref="ToDto"/> needs.</summary>
    public static IQueryable<DrugGroup> WithItems(this IQueryable<DrugGroup> query) =>
        query.Include(g => g.Items).ThenInclude(i => i.Drug);
}
