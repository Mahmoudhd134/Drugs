namespace ClinicHub.Application.Features.Identity.Users;

/// <summary>Phones read from configuration (<c>Platform:*Phones</c>), for the startup seeding.</summary>
public static class ConfigPhones
{
    /// <summary>The E.164 form of a configured phone; an invalid one is a startup error naming <paramref name="setting"/>.</summary>
    public static string Normalize(IPhoneNormalizer normalizer, string phone, string defaultRegion, string setting) =>
        normalizer.Normalize(phone, defaultRegion)
        ?? throw new InvalidOperationException($"{setting}: '{phone}' is not a valid phone number.");
}
