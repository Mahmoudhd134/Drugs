using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Authorization.Policy;
using Microsoft.Extensions.Caching.Hybrid;

namespace ClinicHub.Api.Features.Access;

/// <summary>DI for memberships, the access cache, permission checks and their 403 answers.</summary>
public static class AccessSetup
{
    public static IServiceCollection AddAccessModule(this IServiceCollection services)
    {
        // In memory. For several servers, register a distributed cache (e.g. AddStackExchangeRedisCache):
        // HybridCache uses it as its second level with no code change
        services.AddHybridCache(options => options.DefaultEntryOptions = new HybridCacheEntryOptions
        {
            Expiration = AccessCache.Expiration,
            LocalCacheExpiration = AccessCache.LocalCacheExpiration,
        });

        services.AddScoped<MembershipService>();
        services.AddSingleton<IAccessCache, AccessCache>();
        services.AddScoped<IPermissionService, PermissionService>();
        services.AddScoped<IAuthorizationHandler, ClinicAccessHandler>();
        services.AddScoped<IAuthorizationHandler, PermissionHandler>();
        services.AddSingleton<IAuthorizationMiddlewareResultHandler, AccessAuthorizationResultHandler>();
        services.AddExceptionHandler<AccessExceptionHandler>();
        return services;
    }
}
