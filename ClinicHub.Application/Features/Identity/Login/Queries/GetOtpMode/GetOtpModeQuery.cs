using ClinicHub.Application.Common.Messaging;

namespace ClinicHub.Application.Features.Identity.Login.Queries.GetOtpMode;

/// <summary>The OTP mode, so the login page can show the display-mode banner before any code is asked.</summary>
public record GetOtpModeQuery : IQuery<OtpModeResponse>;
