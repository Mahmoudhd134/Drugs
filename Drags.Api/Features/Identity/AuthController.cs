using Drags.Api.Controllers;
using Drags.Api.Database;
using Drags.Api.Shared;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Drags.Api.Features.Identity;

/// <summary>Phone + OTP login, refresh, context selection and logout (HLD 8.1).</summary>
[Route("api/v1/auth")]
public class AuthController(
    AppDbContext db,
    AppSettings settings,
    OtpService otp,
    SessionService sessions,
    ICurrentUser currentUser) : BaseApiController
{
    public const string RefreshCookie = "drags_refresh";
    /// <summary>The refresh cookie is only sent to the auth endpoints.</summary>
    public const string RefreshCookiePath = "/api/v1/auth";

    /// <summary>The OTP mode, so the login page can show the display-mode banner before any code is asked.</summary>
    [HttpGet("otp/mode")]
    public OtpModeResponse GetOtpMode() => new(settings.Otp.Mode);

    [HttpPost("otp/request")]
    public async Task<ActionResult<OtpRequestResponse>> RequestOtp([FromBody] OtpRequestRequest request,
        CancellationToken cancellationToken)
    {
        var phone = PhoneNormalizer.Normalize(request?.Phone, settings.Platform.DefaultRegion);
        if (phone is null)
            return ApiError(ErrorCodes.InvalidPhone);

        var outcome = await otp.RequestAsync(phone, cancellationToken);
        if (outcome.Error is not null)
        {
            Response.Headers.RetryAfter = outcome.RetryAfterSeconds.ToString();
            return ApiError(outcome.Error, StatusCodes.Status429TooManyRequests);
        }
        return outcome.Response;
    }

    [HttpPost("otp/verify")]
    public async Task<ActionResult<AuthResult>> VerifyOtp([FromBody] OtpVerifyRequest request,
        CancellationToken cancellationToken)
    {
        var phone = PhoneNormalizer.Normalize(request?.Phone, settings.Platform.DefaultRegion);
        if (phone is null)
            return ApiError(ErrorCodes.InvalidPhone);

        if (await otp.VerifyAsync(phone, request.Code, cancellationToken) is { } error)
            return ApiError(error);

        // Same answer for an unknown phone and a user with no clinic: no session either way
        var user = await db.Users.FirstOrDefaultAsync(u => u.Phone == phone, cancellationToken);
        return Respond(user is null
            ? SessionOutcome.Forbidden(ErrorCodes.NoAccess)
            : await sessions.StartAsync(user, cancellationToken));
    }

    /// <summary>401 = no valid session (cookie cleared); 409 = a parallel refresh already rotated this cookie.</summary>
    [HttpPost("refresh")]
    public async Task<ActionResult<AuthResult>> Refresh(CancellationToken cancellationToken) =>
        Respond(await sessions.RefreshAsync(Request.Cookies[RefreshCookie], cancellationToken));

    [Authorize]
    [HttpPost("context")]
    public async Task<ActionResult<AuthResult>> SelectContext([FromBody] ContextRequest request,
        CancellationToken cancellationToken)
    {
        if (currentUser.UserId is not { } userId || currentUser.SessionId is not { } sessionId)
            return Unauthorized();
        return Respond(await sessions.SwitchAsync(userId, sessionId, Request.Cookies[RefreshCookie], request,
            cancellationToken));
    }

    [Authorize]
    [HttpGet("contexts")]
    public async Task<ActionResult<List<ContextDto>>> GetContexts(CancellationToken cancellationToken)
    {
        var user = await db.Users.AsNoTracking().FirstOrDefaultAsync(u => u.Id == currentUser.UserId, cancellationToken);
        if (user is null)
            return Unauthorized();
        return await sessions.GetContextsAsync(user, cancellationToken);
    }

    [HttpPost("logout")]
    public async Task<IActionResult> Logout(CancellationToken cancellationToken)
    {
        await sessions.RevokeAsync(Request.Cookies[RefreshCookie], cancellationToken);
        DeleteRefreshCookie();
        return NoContent();
    }

    /// <summary>Sets the rotated cookie on success; clears it when the session is gone.</summary>
    private ActionResult<AuthResult> Respond(SessionOutcome outcome)
    {
        if (outcome.Issue is { } issue)
        {
            Response.Cookies.Append(RefreshCookie, issue.RefreshToken, RefreshCookieOptions(issue.RefreshExpiresAt));
            return issue.Result;
        }
        if (outcome.Error is not null)
            return ApiError(outcome.Error, outcome.Status);
        if (outcome.ClearCookie)
            DeleteRefreshCookie();
        return Problem(statusCode: outcome.Status);
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
