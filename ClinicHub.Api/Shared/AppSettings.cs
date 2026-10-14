using System.Text;

namespace ClinicHub.Api.Shared;

public class AppSettings
{
    public List<string> AllowedOrigins { get; set; }
    public AuthSettings Auth { get; set; } = new();
    public OtpSettings Otp { get; set; } = new();
    public PlatformSettings Platform { get; set; } = new();
    public MediatRSettings MediatR { get; set; } = new();

    /// <summary>Stops the app at startup on missing secrets, an unusable OTP mode or (outside Development) no MediatR license.</summary>
    public void Validate(bool isDevelopment)
    {
        const int minKeyBytes = 32;
        if (Encoding.UTF8.GetByteCount(Auth.Jwt.SigningKey ?? "") < minKeyBytes)
            throw new InvalidOperationException(
                $"Auth:Jwt:SigningKey is missing or shorter than {minKeyBytes} bytes (set env var Auth__Jwt__SigningKey).");
        if (string.IsNullOrWhiteSpace(Auth.Jwt.Issuer) || string.IsNullOrWhiteSpace(Auth.Jwt.Audience))
            throw new InvalidOperationException("Auth:Jwt:Issuer and Auth:Jwt:Audience are required.");
        if (Encoding.UTF8.GetByteCount(Otp.HashKey ?? "") < minKeyBytes)
            throw new InvalidOperationException(
                $"Otp:HashKey is missing or shorter than {minKeyBytes} bytes (set env var Otp__HashKey).");
        // Display is the only working mode until an SMS sender exists. It is allowed in any
        // environment by config (demos, staging); Program.cs warns outside Development, since it
        // lets anyone log in as any phone
        if (!string.Equals(Otp.Mode, OtpModes.Display, StringComparison.OrdinalIgnoreCase))
            throw new InvalidOperationException(
                $"Otp:Mode '{Otp.Mode}' is not supported: set Otp:Mode to {OtpModes.Display} (Sms has no sender yet).");
        // Normalized, so later == checks work whatever the case in config
        Otp.Mode = OtpModes.Display;
        if (Otp.Length is < 4 or > 9 || Otp.MaxAttempts < 1 || Otp.ExpiryMinutes < 1 || Otp.MaxPerPhonePerHour < 1
            || Otp.ResendSeconds < 0)
            throw new InvalidOperationException(
                "Otp: Length must be 4-9; MaxAttempts, ExpiryMinutes and MaxPerPhonePerHour at least 1; ResendSeconds not negative.");
        if (Auth.AccessTokenMinutes < 1 || Auth.RefreshTokenDays < 1 || Auth.PlatformSessionHours < 1)
            throw new InvalidOperationException("Auth: token and session lifetimes must be positive.");
        // Read by AddApplication; MediatR works without it but is licensed commercially
        if (!isDevelopment && string.IsNullOrWhiteSpace(MediatR.LicenseKey))
            throw new InvalidOperationException(
                "MediatR:LicenseKey is missing (set env var MediatR__LicenseKey; free community license at luckypennysoftware.com).");
    }
}

public class MediatRSettings
{
    /// <summary>Required outside Development (environment variable); may be empty in Development.</summary>
    public string LicenseKey { get; set; }
}

public class AuthSettings
{
    public JwtSettings Jwt { get; set; } = new();
    public int AccessTokenMinutes { get; set; } = 15;
    /// <summary>Sliding session lifetime for users who are not super admins.</summary>
    public int RefreshTokenDays { get; set; } = 30;
    /// <summary>Sliding lifetime of every super-admin session, whatever its context.</summary>
    public int PlatformSessionHours { get; set; } = 12;
}

public class JwtSettings
{
    public string Issuer { get; set; }
    public string Audience { get; set; }
    /// <summary>HS256 key, at least 32 bytes. A secret: environment variable in production.</summary>
    public string SigningKey { get; set; }
}

public class OtpSettings
{
    /// <summary>One of <see cref="OtpModes"/>.</summary>
    public string Mode { get; set; } = OtpModes.Sms;
    public int Length { get; set; } = 6;
    public int ExpiryMinutes { get; set; } = 5;
    public int MaxAttempts { get; set; } = 5;
    public int ResendSeconds { get; set; } = 60;
    public int MaxPerPhonePerHour { get; set; } = 5;
    /// <summary>HMAC key for stored codes, at least 32 bytes. A secret: environment variable in production.</summary>
    public string HashKey { get; set; }
}

public static class OtpModes
{
    /// <summary>
    /// The code is returned by the API and logged, and the login page shows a banner. Any environment
    /// may use it (a startup warning is logged outside Development): anyone can log in as any phone.
    /// </summary>
    public const string Display = "Display";
    /// <summary>The code is sent by SMS (no sender yet: the app refuses to start in this mode).</summary>
    public const string Sms = "Sms";
}

public class PlatformSettings
{
    /// <summary>Region for phone numbers typed without a country code.</summary>
    public string DefaultRegion { get; set; } = "EG";
    public List<string> SuperAdminPhones { get; set; } = [];
    /// <summary>Development seed only: staff with the Owner role in both demo clinics.</summary>
    public string DevOwnerPhone { get; set; }
    /// <summary>
    /// Development seed only: Assistant in "Demo clinic" (no deletes) and "Viewer" (read only) in
    /// "Second demo clinic".
    /// </summary>
    public string DevAssistantPhone { get; set; }
}
