using ClinicHub.Application.Common.Abstractions;
using ClinicHub.Application.Common.Results;
using ClinicHub.Application.Common.Settings;
using ClinicHub.Application.Features.Access.Authorization;
using ClinicHub.Application.Features.Access.StaffMembers;
using ClinicHub.Domain.Identity;
using Microsoft.EntityFrameworkCore;

namespace ClinicHub.Application.Features.Identity.Sessions;

/// <summary>
/// What the session use cases share (HLD 7.1, 7.2): the contexts a user may pick, and issuing tokens
/// for a session. Login, refresh, switch and logout are their own commands.
/// </summary>
internal sealed class SessionService(
    IAppDbContext db,
    AuthSettings settings,
    ITokenService tokens,
    IMembershipService memberships,
    IAccessCache accessCache,
    TimeProvider clock) : ISessionService
{
    public DateTime Now => clock.GetUtcNow().UtcDateTime;

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

    public bool IsLive(Session session) => session.RevokedAt is null && session.ExpiresAt > Now;

    public async Task<Result<SessionIssue>> IssueAsync(Session session, User user, List<ContextDto> contexts,
        CancellationToken cancellationToken)
    {
        var now = Now;
        var context = contexts.FirstOrDefault(c => c.Matches(session.ContextType, session.ClinicId));
        var refreshToken = tokens.NewRefreshToken();
        session.PreviousRefreshTokenHash = session.RefreshTokenHash;
        session.RotatedAt = now;
        session.RefreshTokenHash = tokens.HashRefreshToken(refreshToken);
        session.LastUsedAt = now;
        // A super admin's session always gets the short lifetime: it can enter the platform at any
        // time with a context switch, without a new code
        session.ExpiresAt = user.IsSuperAdmin
            ? now.AddHours(settings.PlatformSessionHours)
            : now.AddDays(settings.RefreshTokenDays);
        // The hash is a concurrency token: another request rotated the same token first
        if (!await TrySaveAsync(cancellationToken))
            return IdentityErrors.RefreshTokenRotated;

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
        return new SessionIssue(new AuthResult(accessToken, expiresAt, context, contexts), refreshToken, session.ExpiresAt);
    }

    public async Task<bool> TrySaveAsync(CancellationToken cancellationToken)
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
}
