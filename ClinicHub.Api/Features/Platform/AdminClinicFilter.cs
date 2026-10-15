using ClinicHub.Api.Errors;
using ClinicHub.Application.Common.Abstractions;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Filters;

namespace ClinicHub.Api.Features.Platform;

/// <summary>
/// <c>[AdminClinic]</c> on the super admin's per-clinic controllers (<c>/admin/clinics/{clinicId}/roles…</c>,
/// <c>/staff…</c>; design D2): the request acts in the route's clinic, so their use cases run exactly like the clinic
/// ones (query filter, save interceptor) and never take a clinic id. Their controllers also need the
/// <c>PlatformAdmin</c> policy, which guarantees no clinic is set yet (a platform token has none).
/// </summary>
[AttributeUsage(AttributeTargets.Class)]
public sealed class AdminClinicAttribute() : TypeFilterAttribute(typeof(AdminClinicFilter));

/// <summary>
/// A resource filter, so it runs after authorization (the policy, in the middleware) and before model binding:
/// <see cref="IClinicScope.EnterAsync"/> with the route's <c>clinicId</c>; a missing, deleted or template clinic
/// answers 404 <c>notFound</c> (ProblemDetails, before the body is even read); a suspended one is allowed (the super
/// admin manages it).
/// </summary>
public sealed class AdminClinicFilter(IClinicScope clinicScope) : IAsyncResourceFilter
{
    public const string RouteKey = "clinicId";

    public async Task OnResourceExecutionAsync(ResourceExecutingContext context, ResourceExecutionDelegate next)
    {
        // The route constraint ({clinicId:int}) makes it an int: anything else is [AdminClinic] on a wrong route
        if (!int.TryParse(context.RouteData.Values[RouteKey]?.ToString(), out var clinicId))
            throw new InvalidOperationException(
                $"[AdminClinic] needs a {{{RouteKey}:int}} route value ({context.ActionDescriptor.DisplayName}).");

        var entered = await clinicScope.EnterAsync(clinicId, context.HttpContext.RequestAborted);
        if (!entered.IsSuccess)
        {
            context.Result = entered.ToProblem();
            return;
        }
        await next();
    }
}
