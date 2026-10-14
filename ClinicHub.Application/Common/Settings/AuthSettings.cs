namespace ClinicHub.Application.Common.Settings;

/// <summary>Config section <c>Auth</c> (validated at startup by the Api's <c>AppSettings.Validate</c>).</summary>
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
