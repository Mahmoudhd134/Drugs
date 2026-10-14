namespace Drags.Domain.Catalog;

/// <summary>
/// How a drug is taken: dose, frequency, duration and eye. Every field is optional.
/// Stored as an owned value (columns on the owning table), so the same shape can be reused
/// by drug defaults, group lines and saved prescription lines. Allowed codes: <see cref="DosingCodes"/>.
/// </summary>
public class Dosing
{
    public decimal? DoseAmount { get; set; }
    public string DoseUnit { get; set; }

    public string Frequency { get; set; }
    /// <summary>Times per day for "daily", hours for "everyHours".</summary>
    public int? FrequencyValue { get; set; }
    /// <summary>Free text for "custom".</summary>
    public string FrequencyText { get; set; }

    public int? DurationValue { get; set; }
    public string DurationUnit { get; set; }

    public string Eye { get; set; }

    /// <summary>
    /// Optional tapering schedule (2+ steps). When set, it replaces Frequency/Duration above.
    /// Stored as one JSON column. See <see cref="DosingRules"/> for the step limits.
    /// </summary>
    public List<TaperStep> TaperSteps { get; set; }
}

/// <summary>
/// One step of a tapering schedule, e.g. "1 drop 4 times a day for 1 week". The unit and eye stay on
/// the <see cref="Dosing"/>.
/// </summary>
public class TaperStep
{
    /// <summary>Optional dose for this step (in the dosing's unit); null = the dosing's dose.</summary>
    public decimal? DoseAmount { get; set; }
    public string Frequency { get; set; }
    public int? FrequencyValue { get; set; }
    public int? DurationValue { get; set; }
    public string DurationUnit { get; set; }
}

public static class DosingCodes
{
    public static readonly string[] DoseUnits = ["drop", "tablet", "capsule", "ml", "application"];
    public static readonly string[] Frequencies = ["daily", "everyHours", "bedtime", "asNeeded", "custom"];
    public static readonly string[] DurationUnits = ["days", "weeks", "months", "continuous", "untilNextVisit"];
    public static readonly string[] Eyes = ["right", "left", "both", "none"];

    /// <summary>Group lines only: the eye is chosen when the group is added to a prescription.</summary>
    public const string AskEye = "ask";
    public static readonly string[] GroupEyes = [.. Eyes, AskEye];
}
