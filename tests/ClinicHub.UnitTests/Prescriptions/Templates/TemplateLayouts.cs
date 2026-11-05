using ClinicHub.Application.Features.Prescriptions.Templates;
using ClinicHub.Application.Features.Prescriptions.Templates.Commands.SavePrescriptionTemplate;
using ClinicHub.UnitTests.TestSupport;
using Shouldly;

namespace ClinicHub.UnitTests.Prescriptions.Templates;

/// <summary>
/// Valid layouts and items to change with <c>with</c>, and the validator run as the API runs it: the controller sends
/// <see cref="SavePrescriptionTemplateCommand.From"/>, so validation sees rounded values (contract § 1.3).
/// </summary>
public static class TemplateLayouts
{
    public static PrescriptionPageDto A5 => new("A5", 148, 210);
    public static PrescriptionPageDto A4 => new("A4", 210, 297);
    public static PrescriptionPageDto Custom(decimal? widthMm, decimal? heightMm) => new("custom", widthMm, heightMm);

    public static PrescriptionItemDto PrescriptionText(string id = "t1", decimal xMm = 14, decimal yMm = 80, decimal wMm = 120,
        decimal hMm = 90, decimal fontSizePt = 11) =>
        new(id, "prescriptionText", null, null, null, xMm, yMm, wMm, hMm, fontSizePt);

    public static PrescriptionItemDto Manual(string name = "الاسم", string id = "m1", decimal xMm = 58, decimal yMm = 46, decimal wMm = 72,
        decimal hMm = 8, decimal fontSizePt = 11) =>
        new(id, "manualInput", null, name, null, xMm, yMm, wMm, hMm, fontSizePt);

    public static PrescriptionItemDto FunctionItem(string function = "fullDate", string name = "التاريخ", string id = "f1", decimal xMm = 14,
        decimal yMm = 46, decimal wMm = 30, decimal hMm = 8, decimal fontSizePt = 11) =>
        new(id, "function", function, name, null, xMm, yMm, wMm, hMm, fontSizePt);

    public static PrescriptionItemDto StaticItem(string text = "نص", string id = "s1", decimal xMm = 14, decimal yMm = 175, decimal wMm = 60,
        decimal hMm = 8, decimal fontSizePt = 11) =>
        new(id, "staticText", null, null, text, xMm, yMm, wMm, hMm, fontSizePt);

    /// <summary>An item of one of the three kinds beside the prescription text, by its code.</summary>
    public static PrescriptionItemDto ItemOfKind(string kind) => kind switch
    {
        "manualInput" => Manual(),
        "function" => FunctionItem(),
        "staticText" => StaticItem(),
        _ => throw new ArgumentOutOfRangeException(nameof(kind), kind, null),
    };

    public static PrescriptionLayoutDto Layout(PrescriptionPageDto page, params PrescriptionItemDto[] items) => new(1, page, [.. items]);

    public static PrescriptionLayoutDto OnA5(params PrescriptionItemDto[] items) => Layout(A5, items);

    /// <summary><paramref name="count"/> valid manual inputs (distinct names and ids).</summary>
    public static PrescriptionItemDto[] ManyManual(int count) =>
        Enumerable.Range(1, count).Select(n => Manual($"حقل {n}", $"m{n}", xMm: 10, yMm: 10, wMm: 20)).ToArray();

    public static ApiValidationAnswer Check(PrescriptionLayoutDto layout) =>
        ApiValidation.Run(new SavePrescriptionTemplateCommandValidator(), SavePrescriptionTemplateCommand.From(layout));

    public static void ShouldPass(PrescriptionLayoutDto layout)
    {
        var answer = Check(layout);
        answer.Errors.ShouldBeEmpty();
        answer.IsValid.ShouldBeTrue();
    }

    /// <summary>A 400 with exactly these errors, in this order; the answer's <c>code</c> is the first's.</summary>
    public static void ShouldFail(PrescriptionLayoutDto layout, params (string Field, string Code)[] errors)
    {
        var answer = Check(layout);
        List<ApiFieldError> expected = errors.Select(e => new ApiFieldError(e.Code, e.Field)).ToList();
        answer.Errors.ShouldBe(expected);
        answer.Status.ShouldBe(400);
        answer.Code.ShouldBe(errors[0].Code);
    }
}
