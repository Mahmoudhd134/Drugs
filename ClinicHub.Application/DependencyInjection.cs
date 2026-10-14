using ClinicHub.Application.Common.Abstractions;
using ClinicHub.Application.Common.Behaviors;
using ClinicHub.Application.Features.Access.Authorization;
using ClinicHub.Application.Features.Access.StaffMembers;
using ClinicHub.Application.Features.Identity.Sessions;
using ClinicHub.Application.Features.Identity.Users;
using ClinicHub.Application.Features.Platform.Clinics;
using ClinicHub.Application.Features.Platform.Provisioning;
using ClinicHub.Application.Features.Platform.Provisioning.Seeders;
using FluentValidation;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;

namespace ClinicHub.Application;

public static class DependencyInjection
{
    /// <summary>Config key of the MediatR license (environment variable <c>MediatR__LicenseKey</c> outside Development).</summary>
    public const string MediatRLicenseKey = "MediatR:LicenseKey";

    /// <summary>
    /// The use cases and the services they share. The settings (<c>AuthSettings</c>, <c>OtpSettings</c>,
    /// <c>PlatformSettings</c>) are registered by the Api, which validates them.
    /// </summary>
    public static IServiceCollection AddApplication(this IServiceCollection services, IConfiguration configuration)
    {
        // Builds and validates the permission catalog now: a bad declaration stops the app at startup
        _ = PermissionCatalog.All;

        // Filled per request by the clinic middleware (or IClinicScope, and by the startup seeder)
        services.AddScoped<ClinicContext>();
        services.AddScoped<IClinicContext>(serviceProvider => serviceProvider.GetRequiredService<ClinicContext>());
        // Sets it where the token doesn't: the admin clinic endpoints, provisioning
        services.AddScoped<IClinicScope, ClinicScope>();
        services.TryAddSingleton(TimeProvider.System);

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

        // Application services shared by use cases (and the Api's authorization handlers)
        services.AddScoped<IMembershipService, MembershipService>();
        services.AddScoped<IPermissionService, PermissionService>();
        services.AddScoped<ISessionService, SessionService>();
        services.AddScoped<IIdentitySeeder, IdentitySeeder>();
        services.AddScoped<IUserAccounts, UserAccounts>();
        services.AddSingleton<IPhoneNormalizer, PhoneNormalizer>();

        // Clinic provisioning (design D5): the seeders run in their Order
        services.AddScoped<IClinicProvisioner, ClinicProvisioner>();
        services.AddScoped<IClinicSeeder, DefaultRolesSeeder>();
        services.AddScoped<IClinicSeeder, OwnerSeeder>();
        services.AddScoped<IClinicSeeder, TemplateCatalogSeeder>();
        return services;
    }
}
