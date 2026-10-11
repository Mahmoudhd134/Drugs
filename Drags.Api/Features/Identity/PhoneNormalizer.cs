using PhoneNumbers;

namespace Drags.Api.Features.Identity;

/// <summary>Phone numbers are stored and compared in E.164 (<c>+201001234567</c>).</summary>
public static class PhoneNormalizer
{
    private static readonly PhoneNumberUtil Util = PhoneNumberUtil.GetInstance();

    /// <summary>
    /// E.164 form of what the user typed (local numbers use <paramref name="defaultRegion"/>), or null
    /// when it is not a valid number.
    /// </summary>
    public static string Normalize(string input, string defaultRegion)
    {
        if (string.IsNullOrWhiteSpace(input) || input.Length > 40)
            return null;
        try
        {
            var number = Util.Parse(input, defaultRegion);
            return Util.IsValidNumber(number) ? Util.Format(number, PhoneNumberFormat.E164) : null;
        }
        catch (NumberParseException)
        {
            return null;
        }
    }
}
