using ClinicHub.Application.Common.Messaging;

namespace ClinicHub.Application.Features.Identity.Commands.RequestOtp;

/// <summary>Creates and sends a login code for a phone, whether or not a user has it (no account probing).</summary>
public record RequestOtpCommand(string Phone) : ICommand<OtpRequestResponse>;
