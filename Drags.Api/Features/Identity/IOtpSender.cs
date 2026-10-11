namespace Drags.Api.Features.Identity;

/// <summary>Delivers a login code. An SMS/WhatsApp sender is added later (<c>Otp:Mode = Sms</c>).</summary>
public interface IOtpSender
{
    /// <summary>True when the code may be returned to the client (<c>devCode</c>): display mode only.</summary>
    bool RevealsCode { get; }

    Task SendAsync(string phone, string code, CancellationToken cancellationToken = default);
}

/// <summary>
/// <c>Otp:Mode = Display</c>: nothing is sent; the code is logged and returned by the API.
/// Allowed in any environment by config; Program.cs logs a warning outside Development.
/// </summary>
public class DisplayOtpSender(ILogger<DisplayOtpSender> logger) : IOtpSender
{
    public bool RevealsCode => true;

    public Task SendAsync(string phone, string code, CancellationToken cancellationToken = default)
    {
        logger.LogWarning("OTP display mode: code {Code} for {Phone}", code, phone);
        return Task.CompletedTask;
    }
}
