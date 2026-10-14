using ClinicHub.Application.Common.Validation;
using ClinicHub.Domain.Catalog;
using FluentValidation;

namespace ClinicHub.Application.Features.Catalog.DrugGroups.Commands.CreateDrugGroup;

/// <summary>
/// In the order the errors are reported: name → at least one item → each item's dosing (the "ask" eye
/// allowed) → no duplicate (drug, eye). Null items are ignored, as when saving. The handler then checks
/// that the drugs exist (<c>drugNotFound</c>).
/// </summary>
internal sealed class CreateDrugGroupCommandValidator : AbstractValidator<CreateDrugGroupCommand>
{
    public CreateDrugGroupCommandValidator()
    {
        RuleFor(x => x.Name).ValidName();

        RuleFor(x => x.Items)
            .Must(items => items is not null && items.Any(item => item is not null))
            .WithError(DrugGroupErrors.DrugsRequired);

        RuleForEach(x => x.Items)
            .Where(item => item is not null)
            .ChildRules(item => item.RuleFor(x => x.Dosing)
                .Must(dosing => DosingRules.IsValid(DosingRules.Normalize(dosing), allowAskEye: true))
                .WithError(DrugGroupErrors.InvalidDosing));

        // The same drug may appear more than once only with different eyes
        RuleFor(x => x.Items)
            .Must(items => SaveDrugGroupItem.Normalize(items) is var normalized
                           && normalized.Select(x => (x.DrugId, x.Dosing?.Eye)).Distinct().Count() == normalized.Count)
            .WithError(DrugGroupErrors.DuplicateItem);
    }
}
