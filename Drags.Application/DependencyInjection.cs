using Drags.Application.Common.Abstractions;
using Microsoft.Extensions.DependencyInjection;

namespace Drags.Application;

public static class DependencyInjection
{
    public static IServiceCollection AddApplication(this IServiceCollection services)
    {
        // Filled per request by the clinic middleware (and by the startup seeder)
        services.AddScoped<ClinicContext>();
        services.AddScoped<IClinicContext>(serviceProvider => serviceProvider.GetRequiredService<ClinicContext>());
        return services;
    }
}
