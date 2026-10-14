using ClinicHub.Domain.Catalog;

namespace ClinicHub.Application.Features.Catalog.Drugs;

/// <param name="DefaultDosing">Null when not set.</param>
public record DrugDto(int Id, string Name, string Description, Dosing DefaultDosing);

public static class DrugMappings
{
    public static DrugDto ToDto(this Drug drug) => new(drug.Id, drug.Name, drug.Description, drug.DefaultDosing);
}
