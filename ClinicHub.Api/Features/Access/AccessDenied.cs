using ClinicHub.Api.Errors;
using ClinicHub.Application.Common.Results;
using ClinicHub.Application.Features.Access;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Authorization.Policy;

namespace ClinicHub.Api.Features.Access;

/// <summary>A failed authorization requirement, with the <see cref="Error"/> to answer.</summary>
public sealed class AccessFailureReason(IAuthorizationHandler handler, Error error)
    : AuthorizationFailureReason(handler, error.Description)
{
    public Error Error { get; } = error;
}

/// <summary>
/// A denied request answers 403 with the most specific error a handler gave (<c>clinicSuspended</c>,
/// <c>noAccess</c>, then <c>forbidden</c>); without one, the default (JwtBearer's 403 <c>forbidden</c>, or 401).
/// </summary>
public sealed class AccessAuthorizationResultHandler : IAuthorizationMiddlewareResultHandler
{
    private static readonly Error[] ErrorsByPriority = [AccessErrors.ClinicSuspended, AccessErrors.NoAccess, CommonErrors.Forbidden];

    private readonly AuthorizationMiddlewareResultHandler defaultHandler = new();

    public Task HandleAsync(RequestDelegate next, HttpContext context, AuthorizationPolicy policy,
        PolicyAuthorizationResult authorizeResult)
    {
        if (authorizeResult.Forbidden && authorizeResult.AuthorizationFailure is { } failure)
        {
            var errors = failure.FailureReasons.OfType<AccessFailureReason>().Select(r => r.Error).ToHashSet();
            if (ErrorsByPriority.FirstOrDefault(errors.Contains) is { } error)
                return ApiProblemFactory.WriteAsync(context, ApiProblemFactory.Create(context, error));
        }
        return defaultHandler.HandleAsync(next, context, policy, authorizeResult);
    }
}
