using Drags.Api.Features.Drugs;
using Drags.Api.Models;

namespace Drags.Api.Features.DrugGroups;

/// <summary>A group with its drugs in order.</summary>
public record DrugGroupDto(int Id, string Name, List<DrugDto> Drugs);

public record SaveDrugGroupRequest(string Name, List<int> DrugIds);

public static class DrugGroupMappings
{
    public static DrugGroupDto ToDto(this DrugGroup group) => new(
        group.Id,
        group.Name,
        group.Items.OrderBy(x => x.Order).Select(x => x.Drug.ToDto()).ToList());
}
