using System.Text.Json;
using ClinicHub.Domain.Prescriptions;

namespace ClinicHub.Application.Features.Prescriptions.Templates;

/// <summary>
/// The pure rules around a layout (contract § 1.3), mirrored by <c>features/printTemplates/layout.ts</c>: run on the DTO
/// before validation and when reading or writing the column.
/// </summary>
internal static class PrescriptionLayoutRules
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    private static readonly PrescriptionCalibrationDto NoCalibration = new(0, 0);

    /// <summary>
    /// One decimal, midpoint away from zero: <c>Math.Round(value, 1, MidpointRounding.AwayFromZero)</c>; null stays null.
    /// <c>decimal</c>, so 0.3 + 209.8 is exactly 210.1 (TPL-210).
    /// </summary>
    public static decimal? Round(decimal? value) =>
        value.HasValue ? Math.Round(value.Value, 1, MidpointRounding.AwayFromZero) : null;

    /// <summary>
    /// What is validated and stored: every number rounded (<see cref="Round"/>); a name trimmed, kept only on a manual input
    /// or a function; a text kept as typed, only on a static text; a function code only on a function; an alignment on those three kinds only. A null page, null
    /// items and null elements stay null (the validator refuses them). A missing or null calibration becomes 0, 0, and a null
    /// number in it stays null for the rules. A null <paramref name="layout"/> never reaches it: binding answers an empty or
    /// <c>null</c> body with <c>invalidRequest</c>.
    /// </summary>
    public static PrescriptionLayoutDto Normalize(PrescriptionLayoutDto layout) =>
        layout with
        {
            Page = layout.Page is null ? null : Normalize(layout.Page),
            Items = layout.Items?.Select(item => item is null ? null : Normalize(item)).ToList(),
            Calibration = Normalize(layout.Calibration ?? NoCalibration),
        };

    /// <summary>
    /// True when <paramref name="start"/> and <paramref name="start"/> + <paramref name="length"/> lie in
    /// [0, <paramref name="sheet"/>]; a negative or missing length counts as 0. Written without adding two values (a huge
    /// one can't overflow <c>decimal</c>): <c>start &gt;= 0 &amp;&amp; length &lt;= sheet &amp;&amp; start &lt;= sheet - length</c>.
    /// </summary>
    public static bool Fits(decimal start, decimal? length, decimal sheet)
    {
        var size = Math.Max(length ?? 0, 0);
        return start >= 0 && size <= sheet && start <= sheet - size;
    }

    /// <summary>The name a template compares: trimmed and <c>ToLowerInvariant</c> (TPL-029).</summary>
    public static string NameKey(string name) => name.Trim().ToLowerInvariant();

    /// <summary>The column's JSON (<c>JsonSerializerDefaults.Web</c>: camelCase; null strings left out by the DTO).</summary>
    public static string Serialize(PrescriptionLayoutDto layout) => JsonSerializer.Serialize(layout, JsonOptions);

    /// <summary>The column's layout. A row saved before step 4 has no calibration: it reads as 0, 0, so answers always hold it and old rows need no data step.</summary>
    public static PrescriptionLayoutDto Deserialize(string json)
    {
        var layout = JsonSerializer.Deserialize<PrescriptionLayoutDto>(json, JsonOptions);
        return layout with { Calibration = layout.Calibration ?? NoCalibration };
    }

    private static PrescriptionPageDto Normalize(PrescriptionPageDto page) =>
        page with { WidthMm = Round(page.WidthMm), HeightMm = Round(page.HeightMm) };

    private static PrescriptionCalibrationDto Normalize(PrescriptionCalibrationDto calibration) =>
        new(WithoutNegativeZero(Round(calibration.XMm)), WithoutNegativeZero(Round(calibration.YMm)));

    /// <summary>A <c>decimal</c> can hold -0.0 (<c>Math.Round(-0.04m, 1)</c> is one), which would be stored and answered with its sign.</summary>
    private static decimal? WithoutNegativeZero(decimal? value) => value == 0 ? 0m : value;

    private static PrescriptionItemDto Normalize(PrescriptionItemDto item) =>
        item with
        {
            Function = item.Kind == PrescriptionTemplateCodes.Function ? item.Function : null,
            Name = item.Kind is PrescriptionTemplateCodes.ManualInput or PrescriptionTemplateCodes.Function
                ? item.Name?.Trim()
                : null,
            Text = item.Kind == PrescriptionTemplateCodes.StaticText ? item.Text : null,
            XMm = Round(item.XMm),
            YMm = Round(item.YMm),
            WMm = Round(item.WMm),
            HMm = Round(item.HMm),
            FontSizePt = Round(item.FontSizePt),
            Align = item.Kind is PrescriptionTemplateCodes.ManualInput or PrescriptionTemplateCodes.Function or PrescriptionTemplateCodes.StaticText
                ? item.Align
                : null,
        };
}
