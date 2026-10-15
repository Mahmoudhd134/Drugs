using ClinicHub.Application.Common.Results;
using ClinicHub.Application.Common.Validation;
using ClinicHub.Domain.Catalog;
using FluentValidation;

namespace ClinicHub.Application.Features.Catalog.DrugGroups.Commands.UpdateDrugGroup;

/// <summary>
/// In the order the errors are reported: name → at least one item → at most
/// <see cref="SaveDrugGroupItem.MaxItems"/> items (<c>invalidRequest</c>; the item rules are then skipped) → each
/// item's dosing (the "ask" eye allowed). Null items are ignored, as when saving. The handler then checks what
/// needs the drugs: that they exist (<c>drugNotFound</c>), then no duplicate (drug, effective eye)
/// (<c>duplicateGroupItem</c>).
/// </summary>
internal sealed class UpdateDrugGroupCommandValidator : AbstractValidator<UpdateDrugGroupCommand>
{
    public UpdateDrugGroupCommandValidator()
    {
        RuleFor(x => x.Name).ValidName();

        RuleFor(x => x.Items)
            .Must(items => items is not null && items.Any(item => item is not null))
            .WithError(DrugGroupErrors.DrugsRequired);

        // A cap first, so the per-item rules below (one error per bad item) can't build a huge answer
        RuleFor(x => x.Items)
            .Must(items => items is null || items.Count <= SaveDrugGroupItem.MaxItems)
            .WithError(CommonErrors.InvalidRequest);

        When(x => x.Items is null || x.Items.Count <= SaveDrugGroupItem.MaxItems, () =>
        {
            RuleForEach(x => x.Items)
                .Where(item => item is not null)
                .ChildRules(item => item.RuleFor(x => x.Dosing)
                    .Must(dosing => DosingRules.IsValid(DosingRules.Normalize(dosing), allowAskEye: true))
                    .WithError(DrugGroupErrors.InvalidDosing));
        });
    }
}
