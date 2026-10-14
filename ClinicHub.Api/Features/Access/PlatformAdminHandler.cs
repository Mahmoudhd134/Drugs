using ClinicHub.Api.Features.Identity;
using ClinicHub.Application.Common.Abstractions;
using ClinicHub.Application.Common.Results;
using ClinicHub.Application.Features.Access.Authorization;
using Microsoft.AspNetCore.Authorization;

namespace ClinicHub.Api.Features.Access;

/// <summary>
/// Part of the <see cref="AuthPolicies.PlatformAdmin"/> policy: the platform token's user must still be a
/// super admin (cached, <see cref="IAccessCache.GetUserAsync"/>), else 403 <c>forbidden</c>.
/// </summary>
public sealed class PlatformAdminRequirement : IAuthorizationRequirement;

public sealed class PlatformAdminHandler(ICurrentUser currentUser, IAccessCache cache)
    : AuthorizationHandler<PlatformAdminRequirement>
{
    protected override async Task HandleRequirementAsync(AuthorizationHandlerContext context,
        PlatformAdminRequirement requirement)
    {
        // Not a platform token: the policy's claim requirement already fails (plain 403 forbidden)
        if (!currentUser.IsPlatform || currentUser.UserId is not { } userId)
            return;
        // With endpoint routing the resource is the HttpContext
        var cancellationToken = context.Resource is HttpContext http ? http.RequestAborted : CancellationToken.None;
        if (await cache.GetUserAsync(userId, cancellationToken) is { IsSuperAdmin: true })
            context.Succeed(requirement);
        else
            context.Fail(new AccessFailureReason(this, CommonErrors.Forbidden));
    }
}
