using ClinicHub.Application.Common.Results;

namespace ClinicHub.Application.Features.Forms.Definitions;

/// <summary>
/// The errors of a form (design dynamic-forms § 4.3). The name reuses <see cref="CommonErrors.NameRequired"/>,
/// <see cref="CommonErrors.NameInvalid"/> and <see cref="CommonErrors.NameTooLong"/>. The definition has only these two
/// outer checks: its content is never validated (D4).
/// </summary>
public static class FormErrors
{
    /// <summary>A missing or deleted form, also on a second DELETE.</summary>
    public static readonly Error NotFound =
        new("notFound", "The form does not exist.", ErrorType.NotFound);

    /// <summary>The definition is missing, null or anything but a JSON object.</summary>
    public static readonly Error DefinitionInvalid =
        new("formDefinitionInvalid", "The form's definition must be a JSON object.", ErrorType.Validation);

    /// <summary>The definition is longer than <see cref="FormLimits.DefinitionMaxBytes"/>.</summary>
    public static readonly Error DefinitionTooLarge =
        new("formDefinitionTooLarge", "The form's definition is larger than allowed.", ErrorType.Validation);
}
