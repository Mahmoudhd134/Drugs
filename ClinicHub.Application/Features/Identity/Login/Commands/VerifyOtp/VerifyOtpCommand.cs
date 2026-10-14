using ClinicHub.Application.Common.Messaging;
using ClinicHub.Application.Features.Identity.Sessions;

namespace ClinicHub.Application.Features.Identity.Login.Commands.VerifyOtp;

/// <summary>
/// Login: checks and consumes the phone's latest code, then starts a session. Commits on failure: a wrong
/// code must stay counted (brute-force limit) and a used code consumed, even when the answer is an error
/// (e.g. 403 <c>noAccess</c> after a right code).
/// </summary>
public record VerifyOtpCommand(string Phone, string Code) : ICommand<SessionIssue>, ICommitOnFailure;
