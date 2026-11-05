using ClinicHub.Application.Common.Messaging;

namespace ClinicHub.Application.Features.Prescriptions.Templates.Commands.SavePrescriptionTemplate;

/// <summary>
/// Creates or replaces the current clinic's template (design D4, § 5). The command's properties are the layout's, so a
/// validation error's field is <c>items[2].name</c>, <c>page.widthMm</c>. Sent through <see cref="From"/>, which
/// normalizes first: rounding and trimming come before validation (TPL-209, TPL-210). Takes no clinic id (D5).
/// </summary>
public record SavePrescriptionTemplateCommand(int? SchemaVersion, PrescriptionPageDto Page, List<PrescriptionItemDto> Items)
    : ICommand<PrescriptionTemplateDto>
{
    public static SavePrescriptionTemplateCommand From(PrescriptionLayoutDto layout)
    {
        var normalized = PrescriptionLayoutRules.Normalize(layout);
        return new SavePrescriptionTemplateCommand(normalized.SchemaVersion, normalized.Page, normalized.Items);
    }
}
