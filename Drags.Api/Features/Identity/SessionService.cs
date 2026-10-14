using Drags.Api.Features.Access;
using Drags.Api.Shared;
using Drags.Domain.Identity;
using Drags.Domain.Platform;
using Drags.Infrastructure.Database;
using Microsoft.EntityFrameworkCore;

namespace Drags.Api.Features.Identity;

/// <summary>What a login, refresh or context switch hands back: the body, and the refresh cookie to set.</summary>
public record SessionIssue(AuthResult Result, string RefreshToken, DateTime RefreshExpiresAt);

/// <summary><see cref="Issue"/> on success; otherwise the HTTP status and, for 403, an <see cref="ErrorCodes"/> value.</summary>
public record SessionOutcome(SessionIssue Issue, int Status = StatusCodes.Status200OK, string Error = null,
    bool ClearCookie = false)
{
    /// <summary>Unknown, expired or revoked session: the refresh cookie is cleared.</summary>
    public static readonly SessionOutcome Unauthorized = new(null, StatusCodes.Status401Unauthorized, ClearCookie: true);
    /// <summary>401 that keeps the cookie (it may belong to another, valid session).</summary>
    public static readonly SessionOutcome Rejected = new(null, StatusCodes.Status401Unauthorized);
    /// <summary>Another request rotated the same refresh token first; the cookie it set is the valid one.</summary>
    public static readonly SessionOutcome Conflict = new(null, StatusCodes.Status409Conflict);
    public static SessionOutcome Forbidden(string error) => new(null, StatusCodes.Status403Forbidden, error);
}

/// <summary>Sessions (one per login per device), their context, and the contexts a user may pick (HLD 7.1, 7.2).</summary>
public class SessionService(
    AppDbContext db,
    AppSettings settings,
    TokenService tokens,
    MembershipService memberships,
    IAccessCache accessCache,
    TimeProvider clock)
{
    /// <summary>How long a just-rotated refresh token still answers 409 instead of 401.</summary>
    private static readonly TimeSpan RotationGrace = TimeSpan.FromSeconds(30);

    private DateTime Now => clock.GetUtcNow().UtcDateTime;

    /// <summary>
    /// Each active clinic where the user is active staff (by name), then, for a super admin, the
    /// template clinic and the platform.
    /// </summary>
    public async Task<List<ContextDto>> GetContextsAsync(User user, CancellationToken cancellationToken)
    {
        var clinics = await memberships.GetEnterableClinicsAsync(user.Id, cancellationToken);
        var contexts = clinics.Select(c => ContextDto.ForClinic(c.ClinicId, c.ClinicName, false, c.Roles)).ToList();

        if (user.IsSuperAdmin)
        {
            var template = await db.Clinics.AsNoTracking()
                .Where(c => c.IsTemplate)
                .Select(c => new { c.Id, c.Name })
                .FirstOrDefaultAsync(cancellationToken);
            if (template is not null)
                contexts.Add(ContextDto.ForClinic(template.Id, template.Name, true, []));
            contexts.Add(ContextDto.Platform);
        }
        return contexts;
    }

    /// <summary>
    /// A new session after a verified code; the context is chosen when there is only one.
    /// <see cref="ErrorCodes.NoAccess"/> (and no session) when the user can enter nothing.
    /// </summary>
    public async Task<SessionOutcome> StartAsync(User user, CancellationToken cancellationToken)
    {
        var contexts = await GetContextsAsync(user, cancellationToken);
        if (contexts.Count == 0)
            return SessionOutcome.Forbidden(ErrorCodes.NoAccess);

        var now = Now;
        // Housekeeping: forget sessions that ended a week ago
        await db.Sessions
            .Where(s => s.ExpiresAt < now.AddDays(-7) || s.RevokedAt < now.AddDays(-7))
            .ExecuteDeleteAsync(cancellationToken);

        user.LastLoginAt = now;
        var session = new Session { Id = Guid.NewGuid(), UserId = user.Id };
        SetContext(session, contexts.Count == 1 ? contexts[0] : null);
        db.Sessions.Add(session);
        return await IssueAsync(session, user, contexts, cancellationToken);
    }

    /// <summary>
    /// Rotates the refresh token and re-checks the context (a lost context is cleared, or replaced
    /// when only one is left). Unauthorized when the token is unknown, expired or revoked, or the
    /// user has lost every context (the session is then revoked).
    /// </summary>
    public async Task<SessionOutcome> RefreshAsync(string refreshToken, CancellationToken cancellationToken)
    {
        if (string.IsNullOrEmpty(refreshToken))
            return SessionOutcome.Unauthorized;
        var hash = TokenService.HashRefreshToken(refreshToken);
        var session = await db.Sessions.Include(s => s.User)
            .FirstOrDefaultAsync(s => s.RefreshTokenHash == hash, cancellationToken);
        if (session is null)
            return await WasJustRotatedAsync(hash, cancellationToken) ? SessionOutcome.Conflict : SessionOutcome.Unauthorized;
        if (!IsLive(session))
            return SessionOutcome.Unauthorized;

        var contexts = await GetContextsAsync(session.User, cancellationToken);
        if (contexts.Count == 0)
        {
            session.RevokedAt = Now;
            await TrySaveAsync(cancellationToken);
            return SessionOutcome.Unauthorized;
        }

        var current = contexts.FirstOrDefault(c => c.Matches(session.ContextType, session.ClinicId));
        SetContext(session, current ?? (contexts.Count == 1 ? contexts[0] : null));
        return await IssueAsync(session, session.User, contexts, cancellationToken);
    }

    /// <summary>
    /// Switches a live session to one of the user's contexts. Forbidden with
    /// <see cref="ErrorCodes.ClinicSuspended"/> or <see cref="ErrorCodes.NoAccess"/> otherwise.
    /// The request must carry this session's refresh cookie: an access token alone (e.g. a stolen
    /// one) can't obtain a new refresh token.
    /// </summary>
    public async Task<SessionOutcome> SwitchAsync(int userId, Guid sessionId, string refreshToken,
        ContextRequest request, CancellationToken cancellationToken)
    {
        var session = await db.Sessions.Include(s => s.User)
            .FirstOrDefaultAsync(s => s.Id == sessionId && s.UserId == userId, cancellationToken);
        if (session is null || !IsLive(session))
            return SessionOutcome.Unauthorized;
        if (string.IsNullOrEmpty(refreshToken))
            return SessionOutcome.Rejected;
        var hash = TokenService.HashRefreshToken(refreshToken);
        if (hash != session.RefreshTokenHash)
            return hash == session.PreviousRefreshTokenHash && session.RotatedAt > Now - RotationGrace
                ? SessionOutcome.Conflict
                : SessionOutcome.Rejected;

        var contexts = await GetContextsAsync(session.User, cancellationToken);
        var target = contexts.FirstOrDefault(c => c.Matches(request?.Type, request?.ClinicId));
        if (target is null)
            return SessionOutcome.Forbidden(await IsSuspendedClinicOfAsync(session.User, request, cancellationToken)
                ? ErrorCodes.ClinicSuspended
                : ErrorCodes.NoAccess);

        SetContext(session, target);
        return await IssueAsync(session, session.User, contexts, cancellationToken);
    }

    /// <summary>Logout: revokes the session of this refresh token, if any.</summary>
    public async Task RevokeAsync(string refreshToken, CancellationToken cancellationToken)
    {
        if (string.IsNullOrEmpty(refreshToken))
            return;
        var hash = TokenService.HashRefreshToken(refreshToken);
        var now = Now;
        // By id, without the token's concurrency check: a refresh rotating it meanwhile can't undo the logout
        var graceStart = now - RotationGrace;
        var sessionId = await db.Sessions
            .Where(s => s.RefreshTokenHash == hash
                        || (s.PreviousRefreshTokenHash == hash && s.RotatedAt > graceStart))
            .Select(s => (Guid?)s.Id).FirstOrDefaultAsync(cancellationToken);
        if (sessionId is not null)
            await db.Sessions.Where(s => s.Id == sessionId && s.RevokedAt == null)
                .ExecuteUpdateAsync(s => s.SetProperty(x => x.RevokedAt, now).SetProperty(x => x.UpdatedAt, now),
                    cancellationToken);
    }

    private bool IsLive(Session session) => session.RevokedAt is null && session.ExpiresAt > Now;

    /// <summary>A live session rotated this token moments ago (a parallel call won the race).</summary>
    private Task<bool> WasJustRotatedAsync(string hash, CancellationToken cancellationToken)
    {
        var now = Now;
        var graceStart = now - RotationGrace;
        return db.Sessions.AnyAsync(s => s.PreviousRefreshTokenHash == hash && s.RotatedAt > graceStart
                                         && s.RevokedAt == null && s.ExpiresAt > now, cancellationToken);
    }

    private static void SetContext(Session session, ContextDto context)
    {
        session.ContextType = context?.Type;
        session.ClinicId = context?.ClinicId;
    }

    /// <summary>Rotates the refresh token, slides the expiry and builds the access token.</summary>
    private async Task<SessionOutcome> IssueAsync(Session session, User user, List<ContextDto> contexts,
        CancellationToken cancellationToken)
    {
        var now = Now;
        var context = contexts.FirstOrDefault(c => c.Matches(session.ContextType, session.ClinicId));
        var refreshToken = TokenService.NewRefreshToken();
        session.PreviousRefreshTokenHash = session.RefreshTokenHash;
        session.RotatedAt = now;
        session.RefreshTokenHash = TokenService.HashRefreshToken(refreshToken);
        session.LastUsedAt = now;
        // A super admin's session always gets the short lifetime: it can enter the platform at any
        // time with a context switch, without a new code
        session.ExpiresAt = user.IsSuperAdmin
            ? now.AddHours(settings.Auth.PlatformSessionHours)
            : now.AddDays(settings.Auth.RefreshTokenDays);
        // The hash is a concurrency token: another request rotated the same token first
        if (!await TrySaveAsync(cancellationToken))
            return SessionOutcome.Conflict;

        var staffId = context is { Type: ContextTypes.Clinic, IsTemplate: false, ClinicId: { } clinicId }
            ? await memberships.GetStaffIdAsync(user.Id, clinicId, cancellationToken)
            : null;
        // A new token starts from fresh access data (roles, active flags, clinic status). The staff
        // entry by its own tag (always right, whoever loaded it), plus every entry of the user: a
        // refresh that moved them out of a clinic they lost must also drop that clinic's entry, which
        // their older access token still points to
        if (staffId is not null)
            await accessCache.InvalidateStaffAsync(staffId.Value, cancellationToken);
        await accessCache.InvalidateUserAsync(user.Id, cancellationToken);
        var (accessToken, expiresAt) = tokens.CreateAccessToken(user, session, staffId);
        return new SessionOutcome(new SessionIssue(
            new AuthResult(accessToken, expiresAt, context, contexts), refreshToken, session.ExpiresAt));
    }

    private async Task<bool> TrySaveAsync(CancellationToken cancellationToken)
    {
        try
        {
            await db.SaveChangesAsync(cancellationToken);
            return true;
        }
        catch (DbUpdateConcurrencyException)
        {
            return false;
        }
    }

    /// <summary>True when the requested clinic is one the user could enter, but it is suspended.</summary>
    private async Task<bool> IsSuspendedClinicOfAsync(User user, ContextRequest request, CancellationToken cancellationToken)
    {
        if (request?.Type != ContextTypes.Clinic || request.ClinicId is not { } clinicId)
            return false;
        var clinic = await db.Clinics.AsNoTracking().FirstOrDefaultAsync(c => c.Id == clinicId, cancellationToken);
        if (clinic is not { Status: ClinicStatus.Suspended })
            return false;
        return clinic.IsTemplate
            ? user.IsSuperAdmin
            : await memberships.IsActiveMemberAsync(user.Id, clinicId, cancellationToken);
    }
}
