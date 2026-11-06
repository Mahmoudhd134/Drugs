namespace ClinicHub.Domain.Prescriptions;

/// <summary>
/// The limits of a print template (design prescription-templates § 3), mirrored by the SPA's
/// <c>features/printTemplates/constants.ts</c>. Millimetres and points keep one decimal.
/// </summary>
public static class PrescriptionTemplateLimits
{
    public const int SchemaVersion = 1;
    public const int MaxItems = 50;
    /// <summary>An item id: letters, digits, <c>_</c> and <c>-</c>; the SPA makes short ones (<c>i1</c>).</summary>
    public const int ItemIdMaxLength = 40;
    public const int NameMaxLength = 60;
    public const int StaticTextMaxLength = 1000;

    public const decimal MinFontSizePt = 6;
    public const decimal MaxFontSizePt = 36;
    public const decimal DefaultFontSizePt = 11;

    public const decimal MinItemWidthMm = 5;
    public const decimal MinItemHeightMm = 4;
    /// <summary>The prescription text's box, so a line always fits.</summary>
    public const decimal MinTextHeightMm = 20;

    public const decimal MinCustomWidthMm = 50;
    public const decimal MaxCustomWidthMm = 420;
    public const decimal MinCustomHeightMm = 50;
    public const decimal MaxCustomHeightMm = 600;

    public const decimal A5WidthMm = 148;
    public const decimal A5HeightMm = 210;
    public const decimal A4WidthMm = 210;
    public const decimal A4HeightMm = 297;

    /// <summary>The printer's correction, X and Y, from minus this to this (step 4 design A5).</summary>
    public const decimal MaxCalibrationMm = 20;
}

/// <summary>The codes a layout holds (design prescription-templates § 3, § 5), kept as strings in its JSON.</summary>
public static class PrescriptionTemplateCodes
{
    public const string PrescriptionText = "prescriptionText";
    public const string ManualInput = "manualInput";
    public const string Function = "function";
    public const string StaticText = "staticText";
    public static readonly string[] Kinds = [PrescriptionText, ManualInput, Function, StaticText];

    public static readonly string[] Functions = ["fullDate", "time", "dayOfWeek", "dayOfMonth", "isoDateTime", "pageNumber"];

    /// <summary>An item's horizontal alignment on the sheet, physical whatever the language; none held reads as right.</summary>
    public static readonly string[] Aligns = ["right", "center", "left"];

    public const string A5 = "A5";
    public const string A4 = "A4";
    public const string Custom = "custom";
    public static readonly string[] PageSizes = [A5, A4, Custom];
}
