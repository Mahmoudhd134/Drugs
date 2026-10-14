using ClinicHub.Application.Features.Identity;
using Microsoft.Extensions.Logging;

namespace ClinicHub.Infrastructure.Identity;

/// <summary>
/// <c>Otp:Mode = Display</c>: nothing is sent; the code is logged and returned by the API.
/// Allowed in any environment by config; Program.cs logs a warning outside Development.
/// </summary>
public sealed class DisplayOtpSender(ILogger<DisplayOtpSender> logger) : IOtpSender
{
    public bool RevealsCode => true;

    public Task SendAsync(string phone, string code, CancellationToken cancellationToken = default)
    {
        logger.LogWarning("OTP display mode: code {Code} for {Phone}", code, phone);
        return Task.CompletedTask;
    }
}
