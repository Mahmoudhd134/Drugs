using ClinicHub.Api.Errors;
using ClinicHub.Api.Shared;
using ClinicHub.Application.Common.Results;
using ClinicHub.Application.Features.Access;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Authorization.Policy;
using Microsoft.AspNetCore.Diagnostics;

namespace ClinicHub.Api.Features.Access;

/// <summary>A failed check inside code; answered with 403 and <see cref="Code"/> by <see cref="AccessExceptionHandler"/>.</summary>
public class AccessDeniedException(string code) : Exception(code)
{
    public string Code { get; } = code;
}

/// <summary>
/// A denied request answers 403 with the most specific code a handler gave (<c>clinicSuspended</c>,
/// <c>noAccess</c>, then <c>forbidden</c>); without one, the default (JwtBearer's 403 <c>forbidden</c>, or 401).
/// </summary>
public sealed class AccessAuthorizationResultHandler : IAuthorizationMiddlewareResultHandler
{
    private static readonly string[] CodesByPriority = [ErrorCodes.ClinicSuspended, ErrorCodes.NoAccess, ErrorCodes.Forbidden];

    private readonly AuthorizationMiddlewareResultHandler defaultHandler = new();

    public Task HandleAsync(RequestDelegate next, HttpContext context, AuthorizationPolicy policy,
        PolicyAuthorizationResult authorizeResult)
    {
        if (authorizeResult.Forbidden && authorizeResult.AuthorizationFailure is { } failure)
        {
            var messages = failure.FailureReasons.Select(r => r.Message).ToHashSet();
            if (CodesByPriority.FirstOrDefault(messages.Contains) is { } code)
                return AccessProblem.WriteAsync(context, code);
        }
        return defaultHandler.HandleAsync(next, context, policy, authorizeResult);
    }
}

/// <summary>Turns an <see cref="AccessDeniedException"/> thrown by <c>EnsureAsync</c> into a 403 with its code.</summary>
public sealed class AccessExceptionHandler : IExceptionHandler
{
    public async ValueTask<bool> TryHandleAsync(HttpContext context, Exception exception, CancellationToken cancellationToken)
    {
        if (exception is not AccessDeniedException denied)
            return false;
        await AccessProblem.WriteAsync(context, denied.Code);
        return true;
    }
}

/// <summary>The 403 answer for an Access code (<c>noAccess</c>, <c>clinicSuspended</c>, else <c>forbidden</c>).</summary>
internal static class AccessProblem
{
    public static Task WriteAsync(HttpContext context, string code) =>
        ApiProblemFactory.WriteAsync(context, ApiProblemFactory.Create(context, ToError(code)));

    public static Error ToError(string code) => code switch
    {
        ErrorCodes.NoAccess => AccessErrors.NoAccess,
        ErrorCodes.ClinicSuspended => AccessErrors.ClinicSuspended,
        _ => CommonErrors.Forbidden with { Code = code },
    };
}
