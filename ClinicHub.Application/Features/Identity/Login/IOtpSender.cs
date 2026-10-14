namespace ClinicHub.Application.Features.Identity.Login;

/// <summary>
/// Delivers a login code (implemented in Infrastructure). An SMS/WhatsApp sender is added later
/// (<c>Otp:Mode = Sms</c>).
/// </summary>
public interface IOtpSender
{
    /// <summary>True when the code may be returned to the client (<c>devCode</c>): display mode only.</summary>
    bool RevealsCode { get; }

    Task SendAsync(string phone, string code, CancellationToken cancellationToken = default);
}
