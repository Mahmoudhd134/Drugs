namespace ClinicHub.Application.Features.Identity.Users;

/// <summary>Phone numbers are stored and compared in E.164 (<c>+201001234567</c>).</summary>
public interface IPhoneNormalizer
{
    /// <summary>
    /// E.164 form of what the user typed (local numbers use <paramref name="defaultRegion"/>), or null
    /// when it is not a valid number.
    /// </summary>
    string Normalize(string input, string defaultRegion);
}
