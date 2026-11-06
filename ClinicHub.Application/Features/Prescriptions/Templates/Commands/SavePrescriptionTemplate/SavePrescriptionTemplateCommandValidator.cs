using ClinicHub.Application.Common.Results;
using ClinicHub.Application.Common.Validation;
using ClinicHub.Domain.Prescriptions;
using FluentValidation;
using FluentValidation.Results;

namespace ClinicHub.Application.Features.Prescriptions.Templates.Commands.SavePrescriptionTemplate;

/// <summary>
/// The rules of a layout, in the order they are reported (contract § 1.4, mirrored by <c>validateLayout</c> in
/// <c>features/printTemplates/layout.ts</c>; <c>tests/fixtures/print-layout-cases.json</c> holds the same list as data for
/// both): schema version, page, item count, prescription text count, then each item in order (id, kind, function, name,
/// text, X, Y, width, height, font), then the calibration. Every failure is returned.
/// </summary>
internal sealed class SavePrescriptionTemplateCommandValidator : AbstractValidator<SavePrescriptionTemplateCommand>
{
    public SavePrescriptionTemplateCommandValidator()
    {
        RuleFor(x => x.SchemaVersion)
            .Must(version => version == PrescriptionTemplateLimits.SchemaVersion)
            .WithError(PrescriptionTemplateErrors.LayoutInvalid);

        RuleFor(x => x.Page).Must(page => page is not null).WithError(CommonErrors.InvalidRequest);

        When(x => x.Page is not null, () =>
            RuleFor(x => x.Page.Size)
                .Must(size => IsKnownSize(size))
                .WithError(PrescriptionTemplateErrors.PageInvalid));

        // An unknown size: only its own error, it has no measures to compare
        When(x => IsKnownSize(x.Page?.Size), () =>
        {
            RuleFor(x => x.Page.WidthMm).Must(width => width.HasValue).WithError(CommonErrors.InvalidRequest);
            RuleFor(x => x.Page.HeightMm).Must(height => height.HasValue).WithError(CommonErrors.InvalidRequest);
            RuleFor(x => x.Page.WidthMm)
                .Must((command, width) => !width.HasValue || IsValidWidth(command.Page))
                .WithError(PrescriptionTemplateErrors.PageInvalid);
            RuleFor(x => x.Page.HeightMm)
                .Must((command, height) => !height.HasValue || IsValidHeight(command.Page))
                .WithError(PrescriptionTemplateErrors.PageInvalid);
        });

        RuleFor(x => x.Items)
            .Must(items => items is null || items.Count <= PrescriptionTemplateLimits.MaxItems)
            .WithError(PrescriptionTemplateErrors.TooManyItems);

        // Over the limit: only that error, so the answer can't grow with the body
        When(x => x.Items is null || x.Items.Count <= PrescriptionTemplateLimits.MaxItems, () =>
        {
            RuleFor(x => x.Items)
                .Must(items => items is not null
                    && items.Count(item => item?.Kind == PrescriptionTemplateCodes.PrescriptionText) == 1)
                .WithError(PrescriptionTemplateErrors.TextCount);

            RuleFor(x => x.Items).Custom(CheckItems);
        });

        // Rules 9 and 10, whatever the item count (step 4 design § 4). Normalize fills a missing calibration, so this only
        // guards a command sent without From. A null number gets rule 9 only. Item rules don't look at calibration: a box must
        // still fit the sheet without it, and one the correction moves off the sheet saves.
        When(x => x.Calibration is not null, () =>
        {
            RuleFor(x => x.Calibration.XMm).Must(number => number.HasValue).WithError(CommonErrors.InvalidRequest);
            RuleFor(x => x.Calibration.YMm).Must(number => number.HasValue).WithError(CommonErrors.InvalidRequest);
            RuleFor(x => x.Calibration.XMm).Must(IsValidCalibration).WithError(PrescriptionTemplateErrors.CalibrationInvalid);
            RuleFor(x => x.Calibration.YMm).Must(IsValidCalibration).WithError(PrescriptionTemplateErrors.CalibrationInvalid);
        });
    }

    /// <summary>
    /// Each item against the ones before it, in one pass: a null element reports where it stands among the others' errors,
    /// and a repeated id or name needs the item's position (records compare by value and a list may hold one twice).
    /// </summary>
    private static void CheckItems(List<PrescriptionItemDto> items, ValidationContext<SavePrescriptionTemplateCommand> context)
    {
        if (items is null)
            return;

        var page = context.InstanceToValidate.Page;
        var sheet = IsValidPage(page) ? page : null;

        for (var index = 0; index < items.Count; index++)
        {
            var field = $"{nameof(SavePrescriptionTemplateCommand.Items)}[{index}]";
            if (items[index] is null)
            {
                var invalid = PrescriptionTemplateErrors.LayoutInvalid;
                context.AddFailure(new ValidationFailure(field, invalid.Description) { ErrorCode = invalid.Code });
                continue;
            }

            var earlier = items.Take(index).Where(item => item is not null).ToList();
            foreach (var failure in ItemRules(earlier, sheet).Validate(items[index]).Errors)
            {
                failure.PropertyName = $"{field}.{failure.PropertyName}";
                context.AddFailure(failure);
            }
        }
    }

    /// <summary>
    /// One item's rules. <paramref name="sheet"/> is null when the page failed: the "outside" checks are skipped, the rest
    /// stays. Inline, not a class of its own: assembly scanning would register a validator that takes these arguments.
    /// </summary>
    private static InlineValidator<PrescriptionItemDto> ItemRules(List<PrescriptionItemDto> earlier, PrescriptionPageDto sheet)
    {
        var rules = new InlineValidator<PrescriptionItemDto>();

        rules.RuleFor(x => x.Id)
            .Must(id => IsValidId(id) && earlier.All(other => other.Id != id))
            .WithError(PrescriptionTemplateErrors.LayoutInvalid);

        rules.RuleFor(x => x.Kind)
            .Must(kind => PrescriptionTemplateCodes.Kinds.Contains(kind))
            .WithError(PrescriptionTemplateErrors.LayoutInvalid);

        // An unknown kind: only its own error, its fields mean nothing
        rules.When(x => PrescriptionTemplateCodes.Kinds.Contains(x.Kind), () =>
        {
            rules.When(x => x.Kind == PrescriptionTemplateCodes.Function, () =>
                rules.RuleFor(x => x.Function)
                    .Must(function => PrescriptionTemplateCodes.Functions.Contains(function))
                    .WithError(PrescriptionTemplateErrors.LayoutInvalid));

            rules.When(x => HasName(x), () =>
                rules.RuleFor(x => x.Name).ValidName(PrescriptionTemplateLimits.NameMaxLength));

            rules.When(x => HasName(x) && !ValidationExtensions.IsBlank(x.Name), () =>
                rules.RuleFor(x => x.Name)
                    .Must(name => !earlier.Any(other => HasName(other) && other.Name is not null
                        && PrescriptionLayoutRules.NameKey(other.Name) == PrescriptionLayoutRules.NameKey(name)))
                    .WithError(PrescriptionTemplateErrors.ItemNameTaken));

            rules.When(x => x.Kind == PrescriptionTemplateCodes.StaticText, () =>
                rules.RuleFor(x => x.Text)
                    .Must(text => !ValidationExtensions.IsBlank(text))
                    .WithError(PrescriptionTemplateErrors.StaticTextRequired)
                    .ValidMultilineText()
                    .Must(text => text is null || text.Length <= PrescriptionTemplateLimits.StaticTextMaxLength)
                    .WithError(PrescriptionTemplateErrors.StaticTextTooLong));

            rules.RuleFor(x => x.XMm)
                .Must(x => x.HasValue).WithError(CommonErrors.InvalidRequest)
                .Must((item, x) => !x.HasValue || sheet is null || PrescriptionLayoutRules.Fits(x.Value, item.WMm, sheet.WidthMm.Value))
                .WithError(PrescriptionTemplateErrors.ItemOutsidePage);

            rules.RuleFor(x => x.YMm)
                .Must(y => y.HasValue).WithError(CommonErrors.InvalidRequest)
                .Must((item, y) => !y.HasValue || sheet is null || PrescriptionLayoutRules.Fits(y.Value, item.HMm, sheet.HeightMm.Value))
                .WithError(PrescriptionTemplateErrors.ItemOutsidePage);

            rules.RuleFor(x => x.WMm)
                .Must(width => width.HasValue).WithError(CommonErrors.InvalidRequest)
                .Must(width => !width.HasValue || width >= PrescriptionTemplateLimits.MinItemWidthMm)
                .WithError(PrescriptionTemplateErrors.ItemSizeInvalid);

            rules.RuleFor(x => x.HMm)
                .Must(height => height.HasValue).WithError(CommonErrors.InvalidRequest)
                .Must((item, height) => !height.HasValue || height >= MinHeight(item))
                .WithError(PrescriptionTemplateErrors.ItemSizeInvalid);

            rules.RuleFor(x => x.FontSizePt)
                .Must(font => font.HasValue).WithError(CommonErrors.InvalidRequest)
                .Must(font => !font.HasValue
                    || (font >= PrescriptionTemplateLimits.MinFontSizePt && font <= PrescriptionTemplateLimits.MaxFontSizePt))
                .WithError(PrescriptionTemplateErrors.FontSizeInvalid);
        });

        return rules;
    }

    private static bool IsValidCalibration(decimal? number) =>
        !number.HasValue || Math.Abs(number.Value) <= PrescriptionTemplateLimits.MaxCalibrationMm;

    private static bool IsKnownSize(string size) => PrescriptionTemplateCodes.PageSizes.Contains(size);

    private static bool IsValidPage(PrescriptionPageDto page) =>
        page is not null && IsKnownSize(page.Size) && IsValidWidth(page) && IsValidHeight(page);

    private static bool IsValidWidth(PrescriptionPageDto page) => page.Size switch
    {
        PrescriptionTemplateCodes.A5 => page.WidthMm == PrescriptionTemplateLimits.A5WidthMm,
        PrescriptionTemplateCodes.A4 => page.WidthMm == PrescriptionTemplateLimits.A4WidthMm,
        _ => page.WidthMm >= PrescriptionTemplateLimits.MinCustomWidthMm && page.WidthMm <= PrescriptionTemplateLimits.MaxCustomWidthMm,
    };

    private static bool IsValidHeight(PrescriptionPageDto page) => page.Size switch
    {
        PrescriptionTemplateCodes.A5 => page.HeightMm == PrescriptionTemplateLimits.A5HeightMm,
        PrescriptionTemplateCodes.A4 => page.HeightMm == PrescriptionTemplateLimits.A4HeightMm,
        _ => page.HeightMm >= PrescriptionTemplateLimits.MinCustomHeightMm && page.HeightMm <= PrescriptionTemplateLimits.MaxCustomHeightMm,
    };

    /// <summary>Letters, digits, <c>_</c> and <c>-</c>, 1 to 40 of them.</summary>
    private static bool IsValidId(string id) =>
        id is { Length: > 0 and <= PrescriptionTemplateLimits.ItemIdMaxLength }
        && id.All(c => char.IsAsciiLetterOrDigit(c) || c is '_' or '-');

    /// <summary>Static text isn't a name, so it may read like one (TPL-029).</summary>
    private static bool HasName(PrescriptionItemDto item) =>
        item.Kind is PrescriptionTemplateCodes.ManualInput or PrescriptionTemplateCodes.Function;

    private static decimal MinHeight(PrescriptionItemDto item) =>
        item.Kind == PrescriptionTemplateCodes.PrescriptionText
            ? PrescriptionTemplateLimits.MinTextHeightMm
            : PrescriptionTemplateLimits.MinItemHeightMm;
}
