using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Authorization.Policy;

namespace ClinicHub.Api.Features.Access;

/// <summary>DI for the permission and super-admin checks on endpoints and their 403 answers (the rules and the cache are in Application/Infrastructure).</summary>
public static class AccessSetup
{
    public static IServiceCollection AddAccessModule(this IServiceCollection services)
    {
        services.AddScoped<IAuthorizationHandler, ClinicAccessHandler>();
        services.AddScoped<IAuthorizationHandler, PermissionHandler>();
        services.AddScoped<IAuthorizationHandler, PlatformAdminHandler>();
        services.AddSingleton<IAuthorizationMiddlewareResultHandler, AccessAuthorizationResultHandler>();
        return services;
    }
}
