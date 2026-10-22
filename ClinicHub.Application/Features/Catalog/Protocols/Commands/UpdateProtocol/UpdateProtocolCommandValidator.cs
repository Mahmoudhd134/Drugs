using ClinicHub.Application.Common.Results;
using ClinicHub.Application.Common.Validation;
using ClinicHub.Domain.Catalog;
using FluentValidation;

namespace ClinicHub.Application.Features.Catalog.Protocols.Commands.UpdateProtocol;

/// <summary>
/// In the order the errors are reported: name → at least one item → at most
/// <see cref="SaveProtocolItem.MaxItems"/> items (<c>invalidRequest</c>; the item rules are then skipped) → each
/// item's dosing (the "ask" eye allowed). Null items are ignored, as when saving. The handler then checks what
/// needs the drugs: that they exist (<c>drugNotFound</c>), then no duplicate (drug, effective eye)
/// (<c>duplicateProtocolItem</c>).
/// </summary>
internal sealed class UpdateProtocolCommandValidator : AbstractValidator<UpdateProtocolCommand>
{
    public UpdateProtocolCommandValidator()
    {
        RuleFor(x => x.Name).ValidName();

        RuleFor(x => x.Items)
            .Must(items => items is not null && items.Any(item => item is not null))
            .WithError(ProtocolErrors.DrugsRequired);

        // A cap first, so the per-item rules below (one error per bad item) can't build a huge answer
        RuleFor(x => x.Items)
            .Must(items => items is null || items.Count <= SaveProtocolItem.MaxItems)
            .WithError(CommonErrors.InvalidRequest);

        When(x => x.Items is null || x.Items.Count <= SaveProtocolItem.MaxItems, () =>
        {
            RuleForEach(x => x.Items)
                .Where(item => item is not null)
                .ChildRules(item => item.RuleFor(x => x.Dosing)
                    .Must(dosing => DosingRules.IsValid(DosingRules.Normalize(dosing), allowAskEye: true))
                    .WithError(ProtocolErrors.InvalidDosing));
        });
    }
}
