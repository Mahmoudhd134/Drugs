using System.Security.Cryptography;
using System.Text;
using ClinicHub.Application.Common.Abstractions;
using ClinicHub.Application.Common.Messaging;
using ClinicHub.Application.Common.Results;
using ClinicHub.Application.Common.Settings;
using ClinicHub.Application.Features.Access;
using ClinicHub.Application.Features.Access.StaffMembers;
using ClinicHub.Application.Features.Identity.Sessions;
using ClinicHub.Application.Features.Identity.Users;
using ClinicHub.Domain.Identity;
using Microsoft.EntityFrameworkCore;

namespace ClinicHub.Application.Features.Identity.Login.Commands.VerifyOtp;

/// <summary>
/// A new session after a verified code (one per login per device); the context is chosen when there is
/// only one. A user who can enter nothing gets no session and the most specific reason
/// (<see cref="IMembershipService.GetEntryRefusalAsync"/>: <see cref="AccessErrors.ClinicSuspended"/>,
/// <see cref="AccessErrors.StaffInactive"/>, else <see cref="AccessErrors.NoAccess"/>); an unknown phone gets
/// <see cref="AccessErrors.NoAccess"/>, like a removed staff member, so phones can't be probed. Only after a right
/// code, so only the phone's owner sees the reason.
/// </summary>
internal sealed class VerifyOtpCommandHandler(
    IAppDbContext db,
    ISessionService sessions,
    IMembershipService memberships,
    IPhoneNormalizer phoneNormalizer,
    OtpSettings otp,
    PlatformSettings platform,
    TimeProvider clock) : ICommandHandler<VerifyOtpCommand, SessionIssue>
{
    public async Task<Result<SessionIssue>> Handle(VerifyOtpCommand command, CancellationToken cancellationToken)
    {
        // Valid: checked by the validator
        var phone = phoneNormalizer.Normalize(command.Phone, platform.DefaultRegion);
        if (await ConsumeCodeAsync(phone, command.Code, cancellationToken) is { } error)
            return error;

        var user = await db.Users.FirstOrDefaultAsync(u => u.Phone == phone, cancellationToken);
        if (user is null)
            return AccessErrors.NoAccess;
        var contexts = await sessions.GetContextsAsync(user, cancellationToken);
        if (contexts.Count == 0)
            return await memberships.GetEntryRefusalAsync(user.Id, null, cancellationToken);

        var now = clock.GetUtcNow().UtcDateTime;
        // Housekeeping: forget sessions that ended a week ago
        await db.Sessions
            .Where(s => s.ExpiresAt < now.AddDays(-7) || s.RevokedAt < now.AddDays(-7))
            .ExecuteDeleteAsync(cancellationToken);

        user.LastLoginAt = now;
        var session = new Session { Id = Guid.NewGuid(), UserId = user.Id };
        SessionRules.SetContext(session, contexts.Count == 1 ? contexts[0] : null);
        db.Sessions.Add(session);
        return await sessions.IssueAsync(session, user, contexts, cancellationToken);
    }

    /// <summary>Checks and consumes the phone's latest code (limited attempts per code). Null on success.</summary>
    private async Task<Error> ConsumeCodeAsync(string phone, string code, CancellationToken cancellationToken)
    {
        var now = clock.GetUtcNow().UtcDateTime;
        var latest = await db.OtpCodes.AsNoTracking()
            .Where(c => c.Phone == phone)
            .OrderByDescending(c => c.CreatedAt).ThenByDescending(c => c.Id)
            .FirstOrDefaultAsync(cancellationToken);

        if (latest is null || latest.ConsumedAt is not null)
            return IdentityErrors.InvalidCode;
        if (latest.Attempts >= otp.MaxAttempts)
            return IdentityErrors.TooManyAttempts;
        if (latest.ExpiresAt <= now)
            return IdentityErrors.CodeExpired;

        var codeHash = OtpHash.Compute(otp.HashKey, phone, NormalizeDigits(code));
        if (!CryptographicOperations.FixedTimeEquals(Encoding.ASCII.GetBytes(codeHash), Encoding.ASCII.GetBytes(latest.CodeHash)))
        {
            // Atomic, so parallel guesses can't exceed the limit (ExecuteUpdate skips the timestamps
            // interceptor). Kept although the command fails: it is ICommitOnFailure
            var counted = await db.OtpCodes
                .Where(c => c.Id == latest.Id && c.Attempts < otp.MaxAttempts && c.ConsumedAt == null)
                .ExecuteUpdateAsync(s => s
                    .SetProperty(c => c.Attempts, c => c.Attempts + 1)
                    .SetProperty(c => c.UpdatedAt, now), cancellationToken);
            return counted == 0 || latest.Attempts + 1 >= otp.MaxAttempts
                ? IdentityErrors.TooManyAttempts
                : IdentityErrors.InvalidCode;
        }

        // Single use: only one of two parallel verifications can consume the code
        var consumed = await db.OtpCodes
            .Where(c => c.Id == latest.Id && c.ConsumedAt == null && c.Attempts < otp.MaxAttempts)
            .ExecuteUpdateAsync(s => s
                .SetProperty(c => c.ConsumedAt, now)
                .SetProperty(c => c.UpdatedAt, now), cancellationToken);
        return consumed == 1 ? null : IdentityErrors.InvalidCode;
    }

    /// <summary>Accepts codes typed with Arabic-Indic (or any Unicode) digits; drops spaces.</summary>
    private static string NormalizeDigits(string code) =>
        new((code ?? "").Where(c => !char.IsWhiteSpace(c))
            .Select(c => char.IsDigit(c) ? (char)('0' + (int)char.GetNumericValue(c)) : c).ToArray());
}
