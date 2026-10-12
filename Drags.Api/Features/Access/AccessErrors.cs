using Drags.Api.Shared;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Authorization.Policy;
using Microsoft.AspNetCore.Diagnostics;

namespace Drags.Api.Features.Access;

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
                return AccessProblem.Write(context, code);
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
        await AccessProblem.Write(context, denied.Code);
        return true;
    }
}

internal static class AccessProblem
{
    public static Task Write(HttpContext context, string code) =>
        Results.Problem(
                title: code,
                statusCode: StatusCodes.Status403Forbidden,
                extensions: new Dictionary<string, object> { ["code"] = code })
            .ExecuteAsync(context);
}
