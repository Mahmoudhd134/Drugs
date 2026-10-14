using Drags.Api.Shared;
using Drags.Domain.Catalog;

namespace Drags.Api.Features.Drugs;

public record DrugDto(int Id, string Name, string Description, Dosing DefaultDosing);

public record SaveDrugRequest(string Name, string Description, Dosing DefaultDosing);

public static class DrugMappings
{
    public static DrugDto ToDto(this Drug drug) => new(drug.Id, drug.Name, drug.Description, drug.DefaultDosing);

    /// <summary>Returns an <see cref="ErrorCodes"/> value, or null when the request is valid.</summary>
    public static string Validate(this SaveDrugRequest request) =>
        ErrorCodes.ValidateName(request.Name)
        ?? (DosingRules.IsValid(DosingRules.Normalize(request.DefaultDosing)) ? null : ErrorCodes.InvalidDosing);

    public static void Apply(this Drug drug, SaveDrugRequest request)
    {
        drug.Name = request.Name.Trim();
        drug.Description = string.IsNullOrWhiteSpace(request.Description) ? null : request.Description.Trim();
        drug.DefaultDosing = DosingRules.Normalize(request.DefaultDosing);
    }
}
