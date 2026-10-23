using ClinicHub.Application.Common.Validation;
using ClinicHub.Application.Features.Catalog.Categories;
using FluentValidation;

namespace ClinicHub.Application.Features.Platform.SharedDrugs.Commands.UpdateSharedDrug;

/// <summary>The clinic drug's rules and order without dosing (design M1.7 § 7): name, active ingredients, description, <c>categoryRequired</c>.</summary>
internal sealed class UpdateSharedDrugCommandValidator : AbstractValidator<UpdateSharedDrugCommand>
{
    public UpdateSharedDrugCommandValidator()
    {
        RuleFor(x => x.Name).ValidName();
        RuleFor(x => x.ActiveIngredients).SingleLineText();
        RuleFor(x => x.Description).ValidText();
        RuleFor(x => x.CategoryId).NotNull().WithError(CategoryErrors.CategoryRequired);
    }
}
