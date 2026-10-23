using ClinicHub.Application.Common.Messaging;

namespace ClinicHub.Application.Features.Platform.SharedDrugs.Commands.CreateSharedDrug;

/// <summary>
/// A new shared drug (design M1.7 D8), inside <c>IClinicScope.UseSharedCatalog()</c>: the clinic create's validation
/// and order (§ 7) without dosing; no Arabic name.
/// </summary>
public record CreateSharedDrugCommand(string Name, string ActiveIngredients, string Description, int? CategoryId,
    int? SubCategoryId) : ICommand<AdminDrugDto>;
