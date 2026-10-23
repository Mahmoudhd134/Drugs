using ClinicHub.Application.Common.Messaging;

namespace ClinicHub.Application.Features.Platform.SharedDrugs.Commands.UpdateSharedDrug;

/// <summary>
/// Full update of a shared drug (design M1.7 D3, D8): a <c>Name</c> that differs (ordinal, after trimming) clears the
/// hidden Arabic name; a withdrawn drug stays withdrawn. Own or unknown id → 404 <c>notFound</c> after the 400s (§ 7).
/// </summary>
public record UpdateSharedDrugCommand(int Id, string Name, string ActiveIngredients, string Description, int? CategoryId,
    int? SubCategoryId) : ICommand<AdminDrugDto>;
