using ClinicHub.Application.Features.Prescriptions.Templates;

namespace ClinicHub.IntegrationTests.Admin.PrescriptionTemplates;

/// <summary>
/// Layouts for the template tests (contract § 4.3). <see cref="L"/> is the catalog's layout L: A5, one prescription text,
/// a manual input «الاسم» and a full date, valid as it stands. A wrong type or a missing field can't be written with these
/// records: send those with <c>ApiClient.SendRawAsync</c>.
/// </summary>
public static class LayoutBuilder
{
    public static string Route(int clinicId) => $"/api/v1/admin/clinics/{clinicId}/prescription-template";

    public static PrescriptionPageDto A5 => new("A5", 148, 210);
    public static PrescriptionPageDto A4 => new("A4", 210, 297);
    public static PrescriptionPageDto Custom(decimal widthMm, decimal heightMm) => new("custom", widthMm, heightMm);

    public static PrescriptionLayoutDto L() => Layout(A5, Text(), Manual("الاسم"), FullDate("التاريخ"));

    public static PrescriptionLayoutDto Layout(PrescriptionPageDto page, params PrescriptionItemDto[] items) =>
        new(1, page, [.. items]);

    public static PrescriptionItemDto Text(string id = "t1", decimal xMm = 14, decimal yMm = 80, decimal wMm = 120,
        decimal hMm = 90, decimal fontSizePt = 11) =>
        new(id, "prescriptionText", null, null, null, xMm, yMm, wMm, hMm, fontSizePt);

    public static PrescriptionItemDto Manual(string name, string id = "m1", decimal xMm = 58, decimal yMm = 46, decimal wMm = 72,
        decimal hMm = 8, decimal fontSizePt = 11) =>
        new(id, "manualInput", null, name, null, xMm, yMm, wMm, hMm, fontSizePt);

    public static PrescriptionItemDto Function(string function, string name, string id = "f1", decimal xMm = 14, decimal yMm = 46,
        decimal wMm = 30, decimal hMm = 8, decimal fontSizePt = 11) =>
        new(id, "function", function, name, null, xMm, yMm, wMm, hMm, fontSizePt);

    public static PrescriptionItemDto FullDate(string name, string id = "f1") => Function("fullDate", name, id);

    public static PrescriptionItemDto Static(string text, string id = "s1", decimal xMm = 14, decimal yMm = 175, decimal wMm = 60,
        decimal hMm = 8, decimal fontSizePt = 11) =>
        new(id, "staticText", null, null, text, xMm, yMm, wMm, hMm, fontSizePt);

    /// <summary>The layout with these items after its own.</summary>
    public static PrescriptionLayoutDto With(this PrescriptionLayoutDto layout, params PrescriptionItemDto[] items) =>
        layout with { Items = [.. layout.Items, .. items] };

    /// <summary><paramref name="count"/> valid manual inputs on an A5 sheet (distinct names and ids), for the item limit.</summary>
    public static PrescriptionItemDto[] ManyManual(int count) =>
        Enumerable.Range(1, count).Select(n => Manual($"حقل {n}", $"m{n}", xMm: 10, yMm: 10, wMm: 20, hMm: 8)).ToArray();
}
