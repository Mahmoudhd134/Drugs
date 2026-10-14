using ClinicHub.Application.Common.Validation;
using ClinicHub.Domain.Catalog;
using FluentValidation;

namespace ClinicHub.Application.Features.Catalog.Drugs.Commands.UpdateDrug;

/// <summary>In the order the errors are reported: name, then dosing.</summary>
internal sealed class UpdateDrugCommandValidator : AbstractValidator<UpdateDrugCommand>
{
    public UpdateDrugCommandValidator()
    {
        RuleFor(x => x.Name).ValidName();
        RuleFor(x => x.DefaultDosing)
            .Must(dosing => DosingRules.IsValid(DosingRules.Normalize(dosing)))
            .WithError(DrugErrors.InvalidDosing);
    }
}
