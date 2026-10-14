using System.Globalization;
using System.Security.Cryptography;
using ClinicHub.Application.Common.Abstractions;
using ClinicHub.Application.Common.Messaging;
using ClinicHub.Application.Common.Results;
using ClinicHub.Application.Common.Settings;
using ClinicHub.Application.Features.Identity.Users;
using ClinicHub.Domain.Identity;
using Microsoft.EntityFrameworkCore;

namespace ClinicHub.Application.Features.Identity.Login.Commands.RequestOtp;

/// <summary>
/// One-time login codes (HLD 7.1): HMAC-hashed, expiring, single use, a resend delay and a maximum per
/// phone per hour (429 with the seconds to wait). Only the latest code of a phone can be used.
/// </summary>
internal sealed class RequestOtpCommandHandler(
    IAppDbContext db,
    IOtpLock otpLock,
    IOtpSender sender,
    IPhoneNormalizer phoneNormalizer,
    OtpSettings otp,
    PlatformSettings platform,
    TimeProvider clock) : ICommandHandler<RequestOtpCommand, OtpRequestResponse>
{
    public async Task<Result<OtpRequestResponse>> Handle(RequestOtpCommand command, CancellationToken cancellationToken)
    {
        // Valid: checked by the validator
        var phone = phoneNormalizer.Normalize(command.Phone, platform.DefaultRegion);
        var now = clock.GetUtcNow().UtcDateTime;
        await db.OtpCodes.Where(c => c.CreatedAt < now.AddDays(-1)).ExecuteDeleteAsync(cancellationToken);

        // Serializes requests for the same phone until the command's transaction ends, so parallel calls
        // can't slip past the limits
        await otpLock.AcquireAsync(phone, cancellationToken);

        var lastHour = await db.OtpCodes.AsNoTracking()
            .Where(c => c.Phone == phone && c.CreatedAt > now.AddHours(-1))
            .OrderByDescending(c => c.CreatedAt)
            .Select(c => c.CreatedAt)
            .ToListAsync(cancellationToken);
        if (lastHour.Count > 0 && lastHour[0].AddSeconds(otp.ResendSeconds) > now)
            return new TooManyRequestsError(SecondsUntil(lastHour[0].AddSeconds(otp.ResendSeconds), now));
        if (lastHour.Count >= otp.MaxPerPhonePerHour)
            return new TooManyRequestsError(SecondsUntil(lastHour[^1].AddHours(1), now));

        var code = RandomNumberGenerator.GetInt32(0, (int)Math.Pow(10, otp.Length))
            .ToString(new string('0', otp.Length), CultureInfo.InvariantCulture);
        db.OtpCodes.Add(new OtpCode
        {
            Phone = phone,
            CodeHash = OtpHash.Compute(otp.HashKey, phone, code),
            ExpiresAt = now.AddMinutes(otp.ExpiryMinutes),
        });
        await db.SaveChangesAsync(cancellationToken);

        // Inside the transaction: a sender that throws leaves no unsent code behind
        await sender.SendAsync(phone, code, cancellationToken);
        return new OtpRequestResponse(otp.ExpiryMinutes * 60, otp.ResendSeconds, sender.RevealsCode ? code : null);
    }

    private static int SecondsUntil(DateTime moment, DateTime now) => Math.Max(1, (int)Math.Ceiling((moment - now).TotalSeconds));
}
