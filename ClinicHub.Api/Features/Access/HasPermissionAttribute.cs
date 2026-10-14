using ClinicHub.Api.Features.Identity;
using ClinicHub.Application.Common.Abstractions;
using ClinicHub.Application.Common.Results;
using ClinicHub.Application.Features.Access;
using Microsoft.AspNetCore.Authorization;

namespace ClinicHub.Api.Features.Access;

/// <summary>
/// <c>[HasPermission(Permissions.Drugs.Create)]</c> on a controller or action: the caller needs a
/// clinic-context token, active access to that clinic and the permission (403 <c>forbidden</c>
/// otherwise). It implies <see cref="AuthPolicies.ClinicContext"/>, so attributes just stack;
/// several of them = all required.
/// </summary>
[AttributeUsage(AttributeTargets.Class | AttributeTargets.Method, AllowMultiple = true)]
public sealed class HasPermissionAttribute : AuthorizeAttribute, IAuthorizationRequirementData
{
    public HasPermissionAttribute(string permission)
    {
        if (!PermissionCatalog.IsKnown(permission))
            throw new ArgumentException($"Unknown permission '{permission}'.", nameof(permission));
        Permission = permission;
        Policy = AuthPolicies.ClinicContext;
    }

    public string Permission { get; }

    public IEnumerable<IAuthorizationRequirement> GetRequirements() => [new PermissionRequirement(Permission)];
}

public sealed record PermissionRequirement(string Permission) : IAuthorizationRequirement;

public sealed class PermissionHandler(IPermissionService permissions) : AuthorizationHandler<PermissionRequirement>
{
    protected override async Task HandleRequirementAsync(AuthorizationHandlerContext context, PermissionRequirement requirement)
    {
        if ((await permissions.GetAsync()).Has(requirement.Permission))
            context.Succeed(requirement);
        else
            context.Fail(new AccessFailureReason(this, CommonErrors.Forbidden));
    }
}

/// <summary>
/// Part of the <see cref="AuthPolicies.ClinicContext"/> policy, so it runs on every clinic request:
/// the staff member and the clinic must still be active (<c>noAccess</c> / <c>clinicSuspended</c>).
/// </summary>
public sealed class ClinicAccessRequirement : IAuthorizationRequirement;

public sealed class ClinicAccessHandler(IPermissionService permissions, ICurrentUser currentUser)
    : AuthorizationHandler<ClinicAccessRequirement>
{
    protected override async Task HandleRequirementAsync(AuthorizationHandlerContext context, ClinicAccessRequirement requirement)
    {
        // Not a clinic token: the policy's claim requirements already fail (plain 403 forbidden)
        if (!currentUser.IsClinic)
            return;
        if (await permissions.CheckClinicAccessAsync() is { } error)
            context.Fail(new AccessFailureReason(this, error));
        else
            context.Succeed(requirement);
    }
}
