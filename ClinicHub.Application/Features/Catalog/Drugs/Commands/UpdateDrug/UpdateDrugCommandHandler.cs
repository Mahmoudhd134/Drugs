using ClinicHub.Application.Common.Abstractions;
using ClinicHub.Application.Common.Messaging;
using ClinicHub.Application.Common.Results;
using ClinicHub.Application.Features.Catalog.Categories;
using ClinicHub.Domain.Catalog;
using Microsoft.EntityFrameworkCore;

namespace ClinicHub.Application.Features.Catalog.Drugs.Commands.UpdateDrug;

/// <summary>
/// After the validator (§ 7): <c>categoryNotFound</c> → <c>subCategoryNotFound</c> → 404 → <c>sharedDrugReadOnly</c>
/// (a shared drug is found through the clinic filter, and never changed here).
/// </summary>
internal sealed class UpdateDrugCommandHandler(IAppDbContext db) : ICommandHandler<UpdateDrugCommand, DrugDto>
{
    public async Task<Result<DrugDto>> Handle(UpdateDrugCommand command, CancellationToken cancellationToken)
    {
        var categoryError = await CategoryRules.CheckDrugCategoryAsync(db, command.CategoryId!.Value, command.SubCategoryId,
            cancellationToken);
        if (categoryError is not null)
            return categoryError;

        var drug = await db.Drugs.FirstOrDefaultAsync(d => d.Id == command.Id, cancellationToken);
        if (drug is null)
            return DrugErrors.NotFound;
        if (drug.ClinicId is null)
            return DrugErrors.SharedDrugReadOnly;

        drug.Name = command.Name.Trim();
        drug.ActiveIngredients = CategoryRules.OptionalText(command.ActiveIngredients);
        drug.Description = CategoryRules.OptionalText(command.Description);
        drug.DefaultDosing = DosingRules.Normalize(command.DefaultDosing);
        drug.CategoryId = command.CategoryId.Value;
        drug.SubCategoryId = command.SubCategoryId;
        await db.SaveChangesAsync(cancellationToken);
        return (await db.Drugs.AsNoTracking().WithCategories().FirstAsync(d => d.Id == drug.Id, cancellationToken)).ToDto();
    }
}
