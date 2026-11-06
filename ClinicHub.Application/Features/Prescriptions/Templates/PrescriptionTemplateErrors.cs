using ClinicHub.Application.Common.Results;

namespace ClinicHub.Application.Features.Prescriptions.Templates;

/// <summary>
/// The errors of a template's layout (design prescription-templates § 5; contract § 1.4), all 400. Names reuse
/// <see cref="CommonErrors.NameRequired"/>, <see cref="CommonErrors.NameInvalid"/> and
/// <see cref="CommonErrors.NameTooLong"/>; static text with a refused character reuses
/// <see cref="CommonErrors.InvalidText"/>.
/// </summary>
public static class PrescriptionTemplateErrors
{
    /// <summary>An unknown schema version, kind or function; a missing, malformed or repeated item id; a null item.</summary>
    public static readonly Error LayoutInvalid =
        new("templateLayoutInvalid", "The template's layout is not valid.", ErrorType.Validation);

    /// <summary>Not exactly one prescription text.</summary>
    public static readonly Error TextCount =
        new("templateTextCount", "The template must hold the prescription text exactly once.", ErrorType.Validation);

    /// <summary>An unknown page size, A5 or A4 with other measures, or a custom page outside its limits.</summary>
    public static readonly Error PageInvalid =
        new("templatePageInvalid", "The page size is not valid.", ErrorType.Validation);

    public static readonly Error ItemOutsidePage =
        new("templateItemOutsidePage", "The item is outside the page.", ErrorType.Validation);

    public static readonly Error ItemSizeInvalid =
        new("templateItemSizeInvalid", "The item is smaller than the minimum size.", ErrorType.Validation);

    public static readonly Error FontSizeInvalid =
        new("templateFontSizeInvalid", "The font size is outside the allowed range.", ErrorType.Validation);

    /// <summary>Another item has the name (trimmed, ignoring case).</summary>
    public static readonly Error ItemNameTaken =
        new("templateItemNameTaken", "Another item of the template has this name.", ErrorType.Validation);

    public static readonly Error StaticTextRequired =
        new("templateStaticTextRequired", "The static text is required.", ErrorType.Validation);

    public static readonly Error StaticTextTooLong =
        new("templateStaticTextTooLong", "The static text is too long.", ErrorType.Validation);

    public static readonly Error TooManyItems =
        new("templateTooManyItems", "The template has too many items.", ErrorType.Validation);

    /// <summary>A calibration number, after rounding, outside -20 to 20 (step 4 design § 4, rule 10).</summary>
    public static readonly Error CalibrationInvalid =
        new("templateCalibrationInvalid", "The printer correction is outside the allowed range.", ErrorType.Validation);
}
