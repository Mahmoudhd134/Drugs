using ClinicHub.Application.Common.Abstractions;
using ClinicHub.Application.Common.Behaviors;
using FluentValidation;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;

namespace ClinicHub.Application;

public static class DependencyInjection
{
    /// <summary>Config key of the MediatR license (environment variable <c>MediatR__LicenseKey</c> outside Development).</summary>
    public const string MediatRLicenseKey = "MediatR:LicenseKey";

    public static IServiceCollection AddApplication(this IServiceCollection services, IConfiguration configuration)
    {
        // Filled per request by the clinic middleware (and by the startup seeder)
        services.AddScoped<ClinicContext>();
        services.AddScoped<IClinicContext>(serviceProvider => serviceProvider.GetRequiredService<ClinicContext>());

        services.AddMediatR(options =>
        {
            // May be empty in Development: MediatR then only logs a warning
            options.LicenseKey = configuration[MediatRLicenseKey];
            options.RegisterServicesFromAssembly(typeof(DependencyInjection).Assembly);
            // In this order: Logging → Validation → Transaction → handler
            options.AddOpenBehavior(typeof(LoggingBehavior<,>));
            options.AddOpenBehavior(typeof(ValidationBehavior<,>));
            options.AddOpenBehavior(typeof(TransactionBehavior<,>));
        });

        services.AddValidatorsFromAssembly(typeof(DependencyInjection).Assembly, includeInternalTypes: true);
        return services;
    }
}
