using Drags.Domain.Common;

namespace Drags.Domain.Identity;

/// <summary>A one-time login code (Identity module). Only its HMAC is stored, never the code.</summary>
public class OtpCode : IHasTimestamps
{
    public int Id { get; set; }
    /// <summary>E.164. Codes exist for any valid phone, even one with no user.</summary>
    public string Phone { get; set; }
    public string CodeHash { get; set; }
    public DateTime ExpiresAt { get; set; }
    /// <summary>Wrong guesses; at <c>Otp:MaxAttempts</c> the code is dead.</summary>
    public int Attempts { get; set; }
    /// <summary>Set when the code is used (single use).</summary>
    public DateTime? ConsumedAt { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
}
