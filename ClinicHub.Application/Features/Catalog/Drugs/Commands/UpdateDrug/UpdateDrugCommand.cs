using ClinicHub.Application.Common.Messaging;
using ClinicHub.Domain.Catalog;

namespace ClinicHub.Application.Features.Catalog.Drugs.Commands.UpdateDrug;

/// <summary>Full update of an own drug; a shared drug → 409 <c>sharedDrugReadOnly</c> after every other check (§ 7).</summary>
public record UpdateDrugCommand(int Id, string Name, string ActiveIngredients, string Description, Dosing DefaultDosing,
    int? CategoryId, int? SubCategoryId) : ICommand<DrugDto>;
