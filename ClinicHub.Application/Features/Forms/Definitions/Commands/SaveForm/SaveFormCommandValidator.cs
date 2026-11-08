using ClinicHub.Application.Common.Validation;
using FluentValidation;

namespace ClinicHub.Application.Features.Forms.Definitions.Commands.SaveForm;

/// <summary>The outer shell only (contract § 2): the name's errors, then the definition's first one. Its content is never read (D4).</summary>
internal sealed class SaveFormCommandValidator : AbstractValidator<SaveFormCommand>
{
    public SaveFormCommandValidator()
    {
        RuleFor(x => x.Name).ValidName();
        RuleFor(x => x.Definition)
            .Cascade(CascadeMode.Stop)
            .Must(FormDefinitionJson.IsObject).WithError(FormErrors.DefinitionInvalid)
            .Must(definition => FormDefinitionJson.IsReadable(definition.Value)).WithError(FormErrors.DefinitionInvalid)
            .Must(definition => FormDefinitionJson.IsWithinLimit(definition.Value)).WithError(FormErrors.DefinitionTooLarge);
    }
}
