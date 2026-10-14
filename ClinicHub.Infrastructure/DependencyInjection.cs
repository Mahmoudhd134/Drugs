using ClinicHub.Application.Common.Abstractions;
using ClinicHub.Infrastructure.Database;
using Microsoft.EntityFrameworkCore;
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
        return services;
    }
}
