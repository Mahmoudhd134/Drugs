using Drags.Api.Models;

namespace Drags.Api.Shared;

public static class DosingRules
{
    public const int MaxFrequencyTextLength = 200;

    /// <summary>
    /// Clears fields that don't apply to the chosen options (e.g. a number for "as needed")
    /// and returns null when nothing is set.
    /// </summary>
    public static Dosing Normalize(Dosing dosing)
    {
        if (dosing is null)
            return null;

        var frequency = Blank(dosing.Frequency);
        var durationUnit = Blank(dosing.DurationUnit);
        var result = new Dosing
        {
            DoseAmount = dosing.DoseAmount,
            DoseUnit = Blank(dosing.DoseUnit),
            Frequency = frequency,
            FrequencyValue = frequency is "daily" or "everyHours" ? dosing.FrequencyValue : null,
            FrequencyText = frequency == "custom" ? Blank(dosing.FrequencyText?.Trim()) : null,
            DurationValue = durationUnit is "days" or "weeks" or "months" ? dosing.DurationValue : null,
            DurationUnit = durationUnit,
            Eye = Blank(dosing.Eye),
        };

        var isEmpty = result.DoseAmount is null && result.DoseUnit is null && result.Frequency is null
                      && result.DurationUnit is null && result.Eye is null;
        return isEmpty ? null : result;
    }

    /// <summary>
    /// Validates a normalized dosing. Returns <see cref="ErrorCodes.InvalidDosing"/> or null.
    /// <paramref name="allowAskEye"/> permits the "ask" eye, which only group lines may use.
    /// </summary>
    public static string Validate(Dosing dosing, bool allowAskEye = false)
    {
        if (dosing is null)
            return null;

        var valid =
            In(dosing.DoseUnit, DosingCodes.DoseUnits)
            && In(dosing.Frequency, DosingCodes.Frequencies)
            && In(dosing.DurationUnit, DosingCodes.DurationUnits)
            && In(dosing.Eye, allowAskEye ? DosingCodes.GroupEyes : DosingCodes.Eyes)
            // An amount needs a unit
            && (dosing.DoseAmount is null || (dosing.DoseUnit is not null && dosing.DoseAmount is > 0 and <= 1000))
            && dosing.Frequency switch
            {
                "daily" => dosing.FrequencyValue is >= 1 and <= 24,
                "everyHours" => dosing.FrequencyValue is >= 1 and <= 72,
                "custom" => dosing.FrequencyText is { Length: <= MaxFrequencyTextLength },
                _ => true
            }
            && dosing.DurationUnit switch
            {
                "days" or "weeks" or "months" => dosing.DurationValue is >= 1 and <= 365,
                _ => true
            };

        return valid ? null : ErrorCodes.InvalidDosing;
    }

    private static bool In(string value, string[] allowed) => value is null || allowed.Contains(value);

    private static string Blank(string value) => string.IsNullOrWhiteSpace(value) ? null : value;
}
