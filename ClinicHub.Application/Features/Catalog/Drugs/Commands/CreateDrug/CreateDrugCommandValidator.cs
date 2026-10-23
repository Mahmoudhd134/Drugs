using ClinicHub.Application.Common.Validation;
using ClinicHub.Application.Features.Catalog.Categories;
using ClinicHub.Domain.Catalog;
using FluentValidation;

namespace ClinicHub.Application.Features.Catalog.Drugs.Commands.CreateDrug;

/// <summary>
/// In the order the errors are reported (design M1.7 § 7): name, active ingredients, description, dosing, then
/// <c>categoryRequired</c>. The handler then checks the category and subcategory exist.
/// </summary>
internal sealed class CreateDrugCommandValidator : AbstractValidator<CreateDrugCommand>
{
    public CreateDrugCommandValidator()
    {
        RuleFor(x => x.Name).ValidName();
        RuleFor(x => x.ActiveIngredients).SingleLineText();
        RuleFor(x => x.Description).ValidText();
        RuleFor(x => x.DefaultDosing)
            .Must(dosing => DosingRules.IsValid(DosingRules.Normalize(dosing)))
            .WithError(DrugErrors.InvalidDosing);
        RuleFor(x => x.CategoryId).NotNull().WithError(CategoryErrors.CategoryRequired);
    }
}
