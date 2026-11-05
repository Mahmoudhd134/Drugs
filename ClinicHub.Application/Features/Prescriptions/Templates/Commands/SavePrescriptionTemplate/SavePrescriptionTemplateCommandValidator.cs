using FluentValidation;

namespace ClinicHub.Application.Features.Prescriptions.Templates.Commands.SavePrescriptionTemplate;

/// <summary>
/// Contract stub (track <c>print-templates/backend</c>): the rules, their order, codes and fields are final in
/// contract § 1.4 (<c>docs/design/prescription-templates.contract.md</c>). In short: schema version, page, item count,
/// prescription text count, then each item in order (id, kind, function, name, text, X, Y, width, height, font).
/// </summary>
internal sealed class SavePrescriptionTemplateCommandValidator : AbstractValidator<SavePrescriptionTemplateCommand>;
