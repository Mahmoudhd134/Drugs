using PhoneNumbers;

namespace ClinicHub.Application.Features.Identity.Users;

/// <summary>Phone numbers are stored and compared in E.164 (<c>+201001234567</c>).</summary>
public sealed class PhoneNormalizer : IPhoneNormalizer
{
    private static readonly PhoneNumberUtil Util = PhoneNumberUtil.GetInstance();

    public string Normalize(string input, string defaultRegion)
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
