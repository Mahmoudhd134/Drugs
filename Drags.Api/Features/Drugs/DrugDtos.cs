using Drags.Api.Models;

namespace Drags.Api.Features.Drugs;

public record DrugDto(int Id, string Name, string Description);

public record SaveDrugRequest(string Name, string Description);

public static class DrugMappings
{
    public static DrugDto ToDto(this Drug drug) => new(drug.Id, drug.Name, drug.Description);

    public static void Apply(this Drug drug, SaveDrugRequest request)
    {
        drug.Name = request.Name.Trim();
        drug.Description = string.IsNullOrWhiteSpace(request.Description) ? null : request.Description.Trim();
    }
}
