namespace ClinicHub.UnitTests.TestSupport;

/// <summary>Test strings that are hard to read in source.</summary>
public static class Text
{
    /// <summary>A name of exactly <paramref name="length"/> characters (Latin and Arabic mixed).</summary>
    public static string OfLength(int length) =>
        string.Concat(Enumerable.Range(0, length).Select(i => i % 2 == 0 ? 'a' : 'ب'));

    public const string ZeroWidthSpace = "\u200B";
    public const string ZeroWidthNonJoiner = "\u200C";
    public const string ZeroWidthJoiner = "\u200D";
    public const string LeftToRightMark = "\u200E";
    public const string RightToLeftMark = "\u200F";
    public const string ArabicLetterMark = "\u061C";
    public const string WordJoiner = "\u2060";
    public const string ByteOrderMark = "\uFEFF";
    public const string SoftHyphen = "\u00AD";
    public const string Tatweel = "\u0640";
    public const string Kasra = "\u0650";
    public const string Shadda = "\u0651";
    public const string SuperscriptAlef = "\u0670";
}
