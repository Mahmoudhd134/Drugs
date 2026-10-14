using System.Globalization;
using System.Security.Cryptography;
using System.Text;
using ClinicHub.Api.Shared;
using ClinicHub.Domain.Identity;
using ClinicHub.Infrastructure.Database;
using Microsoft.EntityFrameworkCore;

namespace ClinicHub.Api.Features.Identity;

/// <summary>Result of an OTP request: <see cref="Error"/> set, or the response to return.</summary>
public record OtpRequestOutcome(string Error, int RetryAfterSeconds, OtpRequestResponse Response);

/// <summary>
/// One-time login codes (HLD 7.1): HMAC-hashed, expiring, single use, limited attempts per code,
/// a resend delay and a maximum per phone per hour. Only the latest code of a phone can be used.
/// </summary>
public class OtpService(AppDbContext db, AppSettings settings, IOtpSender sender, TimeProvider clock)
{
    private OtpSettings Otp => settings.Otp;

    /// <summary>Creates and sends a code for a normalized phone, whether or not a user has it (no account probing).</summary>
    public async Task<OtpRequestOutcome> RequestAsync(string phone, CancellationToken cancellationToken)
    {
        var now = clock.GetUtcNow().UtcDateTime;
        await db.OtpCodes.Where(c => c.CreatedAt < now.AddDays(-1)).ExecuteDeleteAsync(cancellationToken);

        // Serializes requests for the same phone, so parallel calls can't slip past the limits
        await using var transaction = await db.Database.BeginTransactionAsync(cancellationToken);
        await db.Database.ExecuteSqlInterpolatedAsync($"SELECT pg_advisory_xact_lock(hashtext({phone}))", cancellationToken);

        var lastHour = await db.OtpCodes.AsNoTracking()
            .Where(c => c.Phone == phone && c.CreatedAt > now.AddHours(-1))
            .OrderByDescending(c => c.CreatedAt)
            .Select(c => c.CreatedAt)
            .ToListAsync(cancellationToken);
        if (lastHour.Count > 0 && lastHour[0].AddSeconds(Otp.ResendSeconds) > now)
            return new OtpRequestOutcome(ErrorCodes.TooManyRequests, SecondsUntil(lastHour[0].AddSeconds(Otp.ResendSeconds), now), null);
        if (lastHour.Count >= Otp.MaxPerPhonePerHour)
            return new OtpRequestOutcome(ErrorCodes.TooManyRequests, SecondsUntil(lastHour[^1].AddHours(1), now), null);

        var code = RandomNumberGenerator.GetInt32(0, (int)Math.Pow(10, Otp.Length))
            .ToString(new string('0', Otp.Length), CultureInfo.InvariantCulture);
        db.OtpCodes.Add(new OtpCode
        {
            Phone = phone,
            CodeHash = Hash(phone, code),
            ExpiresAt = now.AddMinutes(Otp.ExpiryMinutes),
        });
        await db.SaveChangesAsync(cancellationToken);
        await transaction.CommitAsync(cancellationToken);

        await sender.SendAsync(phone, code, cancellationToken);
        return new OtpRequestOutcome(null, 0, new OtpRequestResponse(
            Otp.ExpiryMinutes * 60, Otp.ResendSeconds, sender.RevealsCode ? code : null));
    }

    /// <summary>Checks and consumes the phone's latest code. Returns an <see cref="ErrorCodes"/> value, or null on success.</summary>
    public async Task<string> VerifyAsync(string phone, string code, CancellationToken cancellationToken)
    {
        var now = clock.GetUtcNow().UtcDateTime;
        var otp = await db.OtpCodes.AsNoTracking()
            .Where(c => c.Phone == phone)
            .OrderByDescending(c => c.CreatedAt).ThenByDescending(c => c.Id)
            .FirstOrDefaultAsync(cancellationToken);

        if (otp is null || otp.ConsumedAt is not null)
            return ErrorCodes.InvalidCode;
        if (otp.Attempts >= Otp.MaxAttempts)
            return ErrorCodes.TooManyAttempts;
        if (otp.ExpiresAt <= now)
            return ErrorCodes.CodeExpired;

        var codeHash = Hash(phone, NormalizeDigits(code));
        if (!CryptographicOperations.FixedTimeEquals(Encoding.ASCII.GetBytes(codeHash), Encoding.ASCII.GetBytes(otp.CodeHash)))
        {
            // Atomic, so parallel guesses can't exceed the limit (ExecuteUpdate skips the timestamps interceptor)
            var counted = await db.OtpCodes
                .Where(c => c.Id == otp.Id && c.Attempts < Otp.MaxAttempts && c.ConsumedAt == null)
                .ExecuteUpdateAsync(s => s
                    .SetProperty(c => c.Attempts, c => c.Attempts + 1)
                    .SetProperty(c => c.UpdatedAt, now), cancellationToken);
            return counted == 0 || otp.Attempts + 1 >= Otp.MaxAttempts ? ErrorCodes.TooManyAttempts : ErrorCodes.InvalidCode;
        }

        // Single use: only one of two parallel verifications can consume the code
        var consumed = await db.OtpCodes
            .Where(c => c.Id == otp.Id && c.ConsumedAt == null && c.Attempts < Otp.MaxAttempts)
            .ExecuteUpdateAsync(s => s
                .SetProperty(c => c.ConsumedAt, now)
                .SetProperty(c => c.UpdatedAt, now), cancellationToken);
        return consumed == 1 ? null : ErrorCodes.InvalidCode;
    }

    private string Hash(string phone, string code)
    {
        var mac = HMACSHA256.HashData(Encoding.UTF8.GetBytes(Otp.HashKey), Encoding.UTF8.GetBytes($"{phone}:{code}"));
        return Convert.ToHexString(mac);
    }

    /// <summary>Accepts codes typed with Arabic-Indic (or any Unicode) digits; drops spaces.</summary>
    private static string NormalizeDigits(string code) =>
        new((code ?? "").Where(c => !char.IsWhiteSpace(c))
            .Select(c => char.IsDigit(c) ? (char)('0' + (int)char.GetNumericValue(c)) : c).ToArray());

    private static int SecondsUntil(DateTime moment, DateTime now) => Math.Max(1, (int)Math.Ceiling((moment - now).TotalSeconds));
}
