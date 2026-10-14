using ClinicHub.Domain.Identity;

namespace ClinicHub.Application.Features.Identity.Sessions;

/// <summary>Session rules shared by the session use cases (no dependencies, so not part of <see cref="ISessionService"/>).</summary>
internal static class SessionRules
{
    /// <summary>How long a just-rotated refresh token still answers 409 instead of 401.</summary>
    public static readonly TimeSpan RotationGrace = TimeSpan.FromSeconds(30);

    public static void SetContext(Session session, ContextDto context)
    {
        session.ContextType = context?.Type;
        session.ClinicId = context?.ClinicId;
    }
}
