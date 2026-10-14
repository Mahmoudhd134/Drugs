using ClinicHub.Application.Common.Messaging;

namespace ClinicHub.Application.Features.Identity.Sessions.Commands.SwitchContext;

/// <summary>
/// Switches the caller's live session (from the access token) to one of the user's contexts. The request
/// must also carry this session's refresh cookie: an access token alone (e.g. a stolen one) can't obtain a
/// new refresh token.
/// </summary>
/// <param name="RefreshToken">From the refresh cookie (may be null).</param>
/// <param name="Type">One of <c>ContextTypes</c>.</param>
public record SwitchContextCommand(string RefreshToken, string Type, int? ClinicId) : ICommand<SessionIssue>;
