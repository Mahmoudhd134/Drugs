using ClinicHub.Api.Controllers;
using ClinicHub.Api.Errors;
using ClinicHub.Application.Common.Results;
using ClinicHub.Application.Features.Identity;
using ClinicHub.Application.Features.Identity.Login.Commands.RequestOtp;
using ClinicHub.Application.Features.Identity.Login.Commands.VerifyOtp;
using ClinicHub.Application.Features.Identity.Login.Queries.GetOtpMode;
using ClinicHub.Application.Features.Identity.Sessions;
using ClinicHub.Application.Features.Identity.Sessions.Commands.Logout;
using ClinicHub.Application.Features.Identity.Sessions.Commands.RefreshSession;
using ClinicHub.Application.Features.Identity.Sessions.Commands.SwitchContext;
using ClinicHub.Application.Features.Identity.Sessions.Queries.GetContexts;
using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace ClinicHub.Api.Features.Identity;

public record RequestOtpRequest(string Phone);

public record VerifyOtpRequest(string Phone, string Code);

public record SwitchContextRequest(string Type, int? ClinicId);

/// <summary>
/// Phone + OTP login, refresh, context selection and logout (HLD 8.1). The refresh cookie is HTTP only, so
/// it is handled here: the use cases get its value and hand back the next one.
/// </summary>
[Route("api/v1/auth")]
public class AuthController(ISender sender) : BaseApiController
{
    public const string RefreshCookie = "clinichub_refresh";
    /// <summary>The refresh cookie is only sent to the auth endpoints.</summary>
    public const string RefreshCookiePath = "/api/v1/auth";

    [HttpGet("otp/mode")]
    public async Task<ActionResult<OtpModeResponse>> GetOtpMode(CancellationToken cancellationToken) =>
        (await sender.Send(new GetOtpModeQuery(), cancellationToken)).ToOk();

    /// <summary>429 <c>tooManyRequests</c> with <c>Retry-After</c> when a code was sent too recently or too often.</summary>
    [HttpPost("otp/request")]
    public async Task<ActionResult<OtpRequestResponse>> RequestOtp([FromBody] RequestOtpRequest request,
        CancellationToken cancellationToken) =>
        (await sender.Send(new RequestOtpCommand(request.Phone), cancellationToken)).ToOk();

    [HttpPost("otp/verify")]
    public async Task<ActionResult<AuthResult>> VerifyOtp([FromBody] VerifyOtpRequest request,
        CancellationToken cancellationToken) =>
        Respond(await sender.Send(new VerifyOtpCommand(request.Phone, request.Code), cancellationToken));

    /// <summary>
    /// 401 = no valid session (cookie cleared; code <c>noContexts</c> when it ended because the user has no clinic
    /// left); 409 = a parallel refresh already rotated this cookie.
    /// </summary>
    [HttpPost("refresh")]
    public async Task<ActionResult<AuthResult>> Refresh(CancellationToken cancellationToken) =>
        Respond(await sender.Send(new RefreshSessionCommand(Request.Cookies[RefreshCookie]), cancellationToken));

    [Authorize]
    [HttpPost("context")]
    public async Task<ActionResult<AuthResult>> SwitchContext([FromBody] SwitchContextRequest request,
        CancellationToken cancellationToken) =>
        Respond(await sender.Send(new SwitchContextCommand(Request.Cookies[RefreshCookie], request.Type, request.ClinicId),
            cancellationToken));

    [Authorize]
    [HttpGet("contexts")]
    public async Task<ActionResult<List<ContextDto>>> GetContexts(CancellationToken cancellationToken) =>
        (await sender.Send(new GetContextsQuery(), cancellationToken)).ToOk();

    [HttpPost("logout")]
    public async Task<IActionResult> Logout(CancellationToken cancellationToken)
    {
        var result = await sender.Send(new LogoutCommand(Request.Cookies[RefreshCookie]), cancellationToken);
        DeleteRefreshCookie();
        return result.ToNoContent();
    }

    /// <summary>Sets the rotated cookie on success; clears it when the session is gone; otherwise leaves it.</summary>
    private ActionResult Respond(Result<SessionIssue> result)
    {
        if (result.IsSuccess)
        {
            Response.Cookies.Append(RefreshCookie, result.Data.RefreshToken, RefreshCookieOptions(result.Data.RefreshExpiresAt));
            return Ok(result.Data.Result);
        }
        // By reference: SessionEnded and RefreshTokenRejected share code and type
        if (ReferenceEquals(result.Error, IdentityErrors.SessionEnded)
            || ReferenceEquals(result.Error, IdentityErrors.NoContexts))
            DeleteRefreshCookie();
        return result.ToProblem();
    }

    private static CookieOptions RefreshCookieOptions(DateTimeOffset? expires = null) => new()
    {
        HttpOnly = true,
        // Browsers accept Secure cookies on http://localhost, so this also works in development
        Secure = true,
        SameSite = SameSiteMode.Strict,
        Path = RefreshCookiePath,
        Expires = expires,
        IsEssential = true,
    };

    private void DeleteRefreshCookie() => Response.Cookies.Delete(RefreshCookie, RefreshCookieOptions());
}
