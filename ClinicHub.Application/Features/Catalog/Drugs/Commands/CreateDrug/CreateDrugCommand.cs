using ClinicHub.Application.Common.Messaging;
using ClinicHub.Domain.Catalog;

namespace ClinicHub.Application.Features.Catalog.Drugs.Commands.CreateDrug;

/// <summary>An own drug of the current clinic (design M1.7 D3). There is no Arabic name.</summary>
/// <param name="CategoryId">Required (null → <c>categoryRequired</c>).</param>
/// <param name="SubCategoryId">Optional; a subcategory of <paramref name="CategoryId"/>.</param>
public record CreateDrugCommand(string Name, string ActiveIngredients, string Description, Dosing DefaultDosing,
    int? CategoryId, int? SubCategoryId) : ICommand<DrugDto>;
