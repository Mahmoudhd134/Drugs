using System.Text.Json.Serialization;

namespace ClinicHub.Application.Features.Identity.Login.Commands.RequestOtp;

/// <summary><see cref="DevCode"/> is only set in display mode.</summary>
public record OtpRequestResponse(
    int ExpiresInSeconds,
    int ResendAfterSeconds,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] string DevCode);
