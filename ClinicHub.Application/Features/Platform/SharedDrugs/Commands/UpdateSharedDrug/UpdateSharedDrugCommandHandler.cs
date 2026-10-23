using ClinicHub.Application.Common.Abstractions;
using ClinicHub.Application.Common.Messaging;
using ClinicHub.Application.Common.Results;
using ClinicHub.Application.Features.Catalog.Categories;
using ClinicHub.Application.Features.Catalog.Drugs;
using Microsoft.EntityFrameworkCore;

namespace ClinicHub.Application.Features.Platform.SharedDrugs.Commands.UpdateSharedDrug;

/// <summary>
/// After the validator: <c>categoryNotFound</c> → <c>subCategoryNotFound</c> → 404. A changed name (ordinal, trimmed)
/// clears the hidden Arabic name (D3; the interceptor refolds <c>SearchOther</c>); a withdrawn drug stays withdrawn.
/// </summary>
internal sealed class UpdateSharedDrugCommandHandler(IAppDbContext db, IClinicScope clinicScope)
    : ICommandHandler<UpdateSharedDrugCommand, AdminDrugDto>
{
    public async Task<Result<AdminDrugDto>> Handle(UpdateSharedDrugCommand request, CancellationToken cancellationToken)
    {
        var categoryError = await CategoryRules.CheckDrugCategoryAsync(db, request.CategoryId!.Value, request.SubCategoryId,
            cancellationToken);
        if (categoryError is not null)
            return categoryError;

        var drug = await db.Drugs.FirstOrDefaultAsync(d => d.Id == request.Id && d.ClinicId == null, cancellationToken);
        if (drug is null)
            return SharedDrugErrors.NotFound;

        var name = request.Name.Trim();
        if (!string.Equals(name, drug.Name, StringComparison.Ordinal))
            drug.NameAr = null;
        drug.Name = name;
        drug.ActiveIngredients = CategoryRules.OptionalText(request.ActiveIngredients);
        drug.Description = CategoryRules.OptionalText(request.Description);
        drug.CategoryId = request.CategoryId.Value;
        drug.SubCategoryId = request.SubCategoryId;
        using (clinicScope.UseSharedCatalog())
            await db.SaveChangesAsync(cancellationToken);

        return (await db.Drugs.AsNoTracking().WithCategories().FirstAsync(d => d.Id == drug.Id, cancellationToken))
            .ToAdminDto();
    }
}
