using ClinicHub.Application.Common.Abstractions;
using ClinicHub.Application.Common.Messaging;
using ClinicHub.Application.Common.Results;
using ClinicHub.Application.Features.Catalog.Categories;
using ClinicHub.Domain.Catalog;
using Microsoft.EntityFrameworkCore;

namespace ClinicHub.Application.Features.Catalog.Drugs.Commands.CreateDrug;

/// <summary>After the validator: <c>categoryNotFound</c> → <c>subCategoryNotFound</c> (§ 7). The interceptor stamps the clinic.</summary>
internal sealed class CreateDrugCommandHandler(IAppDbContext db) : ICommandHandler<CreateDrugCommand, DrugDto>
{
    public async Task<Result<DrugDto>> Handle(CreateDrugCommand command, CancellationToken cancellationToken)
    {
        var categoryError = await CategoryRules.CheckDrugCategoryAsync(db, command.CategoryId!.Value, command.SubCategoryId,
            cancellationToken);
        if (categoryError is not null)
            return categoryError;

        var drug = new Drug
        {
            Name = command.Name.Trim(),
            ActiveIngredients = CategoryRules.OptionalText(command.ActiveIngredients),
            Description = CategoryRules.OptionalText(command.Description),
            DefaultDosing = DosingRules.Normalize(command.DefaultDosing),
            CategoryId = command.CategoryId.Value,
            SubCategoryId = command.SubCategoryId,
        };
        db.Drugs.Add(drug);
        await db.SaveChangesAsync(cancellationToken);
        return (await db.Drugs.AsNoTracking().WithCategories().FirstAsync(d => d.Id == drug.Id, cancellationToken)).ToDto();
    }
}
