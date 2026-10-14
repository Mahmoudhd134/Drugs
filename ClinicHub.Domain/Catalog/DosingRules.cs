namespace ClinicHub.Domain.Catalog;

public static class DosingRules
{
    public const int MaxFrequencyTextLength = 200;

    // Tapering schedule limits. Mirrored in ClinicHub.Web/src/features/dosing/taperConfig.ts: keep both in sync.
    public const int MaxTaperSteps = 10;
    public static readonly string[] TaperFrequencies = ["daily", "everyHours"];
    public static readonly string[] TaperDurationUnits = ["days", "weeks"];
    /// <summary>Open-ended periods are only allowed on the last step.</summary>
    public static readonly string[] TaperLastDurationUnits = [.. TaperDurationUnits, "continuous", "untilNextVisit"];

    /// <summary>
    /// Clears fields that don't apply to the chosen options (e.g. a number for "as needed")
    /// and returns null when nothing is set. A tapering schedule replaces the frequency and
    /// duration; a one-step schedule becomes a plain frequency + duration.
    /// </summary>
    public static Dosing Normalize(Dosing dosing)
    {
        if (dosing is null)
            return null;

        var doseAmount = dosing.DoseAmount;
        var steps = dosing.TaperSteps?.Select(NormalizeStep).ToList();
        if (steps is { Count: 0 })
            steps = null;
        if (steps is not null)
        {
            // The first step's dose is the dosing's dose; a step dose equal to it is just "the same dose"
            doseAmount = steps[0].DoseAmount ?? doseAmount;
            steps[0].DoseAmount = null;
            foreach (var step in steps.Where(s => s.DoseAmount == doseAmount))
                step.DoseAmount = null;
        }

        var frequency = Blank(dosing.Frequency);
        var frequencyValue = dosing.FrequencyValue;
        var frequencyText = dosing.FrequencyText;
        var durationValue = dosing.DurationValue;
        var durationUnit = Blank(dosing.DurationUnit);
        if (steps is not null)
        {
            // A single step is just a normal frequency + duration
            var first = steps.Count == 1 ? steps[0] : new TaperStep();
            frequency = first.Frequency;
            frequencyValue = first.FrequencyValue;
            frequencyText = null;
            durationValue = first.DurationValue;
            durationUnit = first.DurationUnit;
            if (steps.Count == 1)
                steps = null;
        }

        var result = new Dosing
        {
            DoseAmount = doseAmount,
            DoseUnit = Blank(dosing.DoseUnit),
            Frequency = frequency,
            FrequencyValue = frequency is "daily" or "everyHours" ? frequencyValue : null,
            FrequencyText = frequency == "custom" ? Blank(frequencyText?.Trim()) : null,
            DurationValue = durationUnit is "days" or "weeks" or "months" ? durationValue : null,
            DurationUnit = durationUnit,
            Eye = Blank(dosing.Eye),
            TaperSteps = steps,
        };

        var isEmpty = result.DoseAmount is null && result.DoseUnit is null && result.Frequency is null
                      && result.DurationUnit is null && result.Eye is null && result.TaperSteps is null;
        return isEmpty ? null : result;
    }

    private static TaperStep NormalizeStep(TaperStep step)
    {
        var frequency = Blank(step?.Frequency);
        var durationUnit = Blank(step?.DurationUnit);
        return new TaperStep
        {
            DoseAmount = step?.DoseAmount,
            Frequency = frequency,
            FrequencyValue = frequency is "daily" or "everyHours" ? step.FrequencyValue : null,
            DurationValue = durationUnit is "days" or "weeks" or "months" ? step.DurationValue : null,
            DurationUnit = durationUnit,
        };
    }

    /// <summary>
    /// Whether a normalized dosing is valid (no dosing is valid). Callers map false to their error code.
    /// <paramref name="allowAskEye"/> permits the "ask" eye, which only group lines may use.
    /// </summary>
    public static bool IsValid(Dosing dosing, bool allowAskEye = false)
    {
        if (dosing is null)
            return true;

        var valid =
            In(dosing.DoseUnit, DosingCodes.DoseUnits)
            && In(dosing.Frequency, DosingCodes.Frequencies)
            && In(dosing.DurationUnit, DosingCodes.DurationUnits)
            && In(dosing.Eye, allowAskEye ? DosingCodes.GroupEyes : DosingCodes.Eyes)
            // An amount needs a unit
            && (dosing.DoseAmount is null || (dosing.DoseUnit is not null && dosing.DoseAmount is > 0 and <= 1000))
            && ValidFrequency(dosing.Frequency, dosing.FrequencyValue, dosing.FrequencyText)
            && ValidDuration(dosing.DurationUnit, dosing.DurationValue)
            && (dosing.TaperSteps is null || ValidSteps(dosing));

        return valid;
    }

    private static bool ValidSteps(Dosing dosing)
    {
        var steps = dosing.TaperSteps;
        if (steps.Count is < 2 or > MaxTaperSteps || dosing.Frequency is not null || dosing.DurationUnit is not null)
            return false;

        // Every step needs a frequency and a period; open-ended periods only on the last step
        return steps.Select((step, i) =>
                // A step dose uses the dosing's unit, which a group line may inherit from the drug
                step.DoseAmount is null or > 0 and <= 1000
                && step.Frequency is not null && TaperFrequencies.Contains(step.Frequency)
                && step.DurationUnit is not null
                && (i == steps.Count - 1 ? TaperLastDurationUnits : TaperDurationUnits).Contains(step.DurationUnit)
                && ValidFrequency(step.Frequency, step.FrequencyValue, null)
                && ValidDuration(step.DurationUnit, step.DurationValue))
            .All(ok => ok);
    }

    private static bool ValidFrequency(string frequency, int? value, string text) => frequency switch
    {
        "daily" => value is >= 1 and <= 24,
        "everyHours" => value is >= 1 and <= 72,
        "custom" => text is { Length: <= MaxFrequencyTextLength },
        _ => true
    };

    private static bool ValidDuration(string unit, int? value) => unit switch
    {
        "days" or "weeks" or "months" => value is >= 1 and <= 365,
        _ => true
    };

    private static bool In(string value, string[] allowed) => value is null || allowed.Contains(value);

    private static string Blank(string value) => string.IsNullOrWhiteSpace(value) ? null : value;
}
