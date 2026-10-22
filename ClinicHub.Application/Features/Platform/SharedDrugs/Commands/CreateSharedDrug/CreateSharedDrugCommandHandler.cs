using ClinicHub.Application.Common.Abstractions;
using ClinicHub.Application.Common.Messaging;
using ClinicHub.Application.Common.Results;
using ClinicHub.Application.Features.Catalog.Categories;
using ClinicHub.Application.Features.Catalog.Drugs;
using ClinicHub.Domain.Catalog;
using Microsoft.EntityFrameworkCore;

namespace ClinicHub.Application.Features.Platform.SharedDrugs.Commands.CreateSharedDrug;

/// <summary>After the validator: <c>categoryNotFound</c> → <c>subCategoryNotFound</c>; saved inside <c>UseSharedCatalog()</c>.</summary>
internal sealed class CreateSharedDrugCommandHandler(IAppDbContext db, IClinicScope clinicScope)
    : ICommandHandler<CreateSharedDrugCommand, AdminDrugDto>
{
    public async Task<Result<AdminDrugDto>> Handle(CreateSharedDrugCommand request, CancellationToken cancellationToken)
    {
        var categoryError = await CategoryRules.CheckDrugCategoryAsync(db, request.CategoryId!.Value, request.SubCategoryId,
            cancellationToken);
        if (categoryError is not null)
            return categoryError;

        var drug = new Drug
        {
            Name = request.Name.Trim(),
            ActiveIngredients = CategoryRules.OptionalText(request.ActiveIngredients),
            Description = CategoryRules.OptionalText(request.Description),
            CategoryId = request.CategoryId.Value,
            SubCategoryId = request.SubCategoryId,
        };
        using (clinicScope.UseSharedCatalog())
        {
            db.Drugs.Add(drug);
            await db.SaveChangesAsync(cancellationToken);
        }

        return (await db.Drugs.AsNoTracking().WithCategories().FirstAsync(d => d.Id == drug.Id, cancellationToken))
            .ToAdminDto();
    }
}
