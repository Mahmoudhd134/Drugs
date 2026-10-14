namespace ClinicHub.Application.Common.Settings;

/// <summary>Config section <c>Otp</c> (validated at startup by the Api's <c>AppSettings.Validate</c>).</summary>
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
