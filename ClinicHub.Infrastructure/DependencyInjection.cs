using ClinicHub.Application.Common.Abstractions;
using ClinicHub.Application.Features.Access.Authorization;
using ClinicHub.Application.Features.Identity.Login;
using ClinicHub.Application.Features.Identity.Sessions;
using ClinicHub.Infrastructure.Access;
using ClinicHub.Infrastructure.Database;
using ClinicHub.Infrastructure.Identity;
using ClinicHub.Infrastructure.Platform;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Hybrid;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;

namespace ClinicHub.Infrastructure;

public static class DependencyInjection
{
    public static IServiceCollection AddInfrastructure(this IServiceCollection services, IConfiguration configuration)
    {
        services.AddSingleton<ClinicAndTimestampsInterceptor>();
        services.AddDbContext<AppDbContext>((serviceProvider, options) => options
            .UseNpgsql(configuration.GetConnectionString("DefaultConnection"))
            .AddInterceptors(serviceProvider.GetRequiredService<ClinicAndTimestampsInterceptor>()));
        services.AddScoped<IAppDbContext>(serviceProvider => serviceProvider.GetRequiredService<AppDbContext>());
        services.AddScoped<ITransactionRunner, TransactionRunner>();

        // In memory. For several servers, register a distributed cache (e.g. AddStackExchangeRedisCache):
        // HybridCache uses it as its second level with no code change
        services.AddHybridCache(options => options.DefaultEntryOptions = new HybridCacheEntryOptions
        {
            Expiration = AccessCache.Expiration,
            LocalCacheExpiration = AccessCache.LocalCacheExpiration,
        });
        services.AddSingleton<IAccessCache, AccessCache>();

        services.AddSingleton<ITokenService, TokenService>();
        // The only sender so far (AppSettings.Validate refuses other modes); an SMS sender goes here
        services.AddSingleton<IOtpSender, DisplayOtpSender>();
        services.AddScoped<IOtpLock, OtpLock>();

        services.AddScoped<IStartupSeeder, StartupSeeder>();
        return services;
    }
}
