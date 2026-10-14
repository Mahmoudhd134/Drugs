using ClinicHub.Application.Common.Validation;
using ClinicHub.Domain.Catalog;
using FluentValidation;

namespace ClinicHub.Application.Features.Catalog.Drugs.Commands.CreateDrug;

/// <summary>In the order the errors are reported: name, description, then dosing.</summary>
internal sealed class CreateDrugCommandValidator : AbstractValidator<CreateDrugCommand>
{
    public CreateDrugCommandValidator()
    {
        RuleFor(x => x.Name).ValidName();
        RuleFor(x => x.Description).ValidText();
        RuleFor(x => x.DefaultDosing)
            .Must(dosing => DosingRules.IsValid(DosingRules.Normalize(dosing)))
            .WithError(DrugErrors.InvalidDosing);
    }
}
