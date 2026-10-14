using Drags.Domain.Common;

namespace Drags.Domain.Identity;

/// <summary>A login on one device (Identity module): a refresh token + the current context.</summary>
public class Session : IHasTimestamps
{
    /// <summary>The <c>sid</c> claim.</summary>
    public Guid Id { get; set; }
    public int UserId { get; set; }
    public User User { get; set; }
    /// <summary>SHA-256 of the refresh token; replaced on every refresh (concurrency token).</summary>
    public string RefreshTokenHash { get; set; }
    /// <summary>The hash before the last rotation, recognized for a few seconds (a parallel call that lost the race).</summary>
    public string PreviousRefreshTokenHash { get; set; }
    public DateTime? RotatedAt { get; set; }
    /// <summary>One of <see cref="ContextTypes"/>, or null when no context is chosen yet.</summary>
    public string ContextType { get; set; }
    /// <summary>Set when <see cref="ContextType"/> is <see cref="ContextTypes.Clinic"/>.</summary>
    public int? ClinicId { get; set; }
    /// <summary>Sliding expiry, moved forward on every refresh.</summary>
    public DateTime ExpiresAt { get; set; }
    public DateTime LastUsedAt { get; set; }
    public DateTime? RevokedAt { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
}

/// <summary>What a session acts as: a clinic (as staff, or the template as super admin) or the platform.</summary>
public static class ContextTypes
{
    public const string Clinic = "clinic";
    public const string Platform = "platform";
}
