using ClinicHub.Api.Errors;
using ClinicHub.Api.Features.Access;
using ClinicHub.Application.Common.Abstractions;
using ClinicHub.Application.Common.Results;
using ClinicHub.Application.Common.Settings;
using ClinicHub.Domain.Identity;
using ClinicHub.Infrastructure.Identity;
using Microsoft.AspNetCore.Authentication.JwtBearer;

namespace ClinicHub.Api.Features.Identity;

public static class AuthPolicies
{
    /// <summary>
    /// An access token in a clinic context, and the staff member and clinic still active (cached
    /// check, <c>Access.ClinicAccessRequirement</c>). Platform or no-context tokens → 403
    /// <c>forbidden</c>; inactive staff → <c>noAccess</c>; suspended clinic → <c>clinicSuspended</c>.
    /// Implied by <c>[HasPermission]</c>.
    /// </summary>
    public const string ClinicContext = "ClinicContext";
}

/// <summary>DI and middleware for the caller, access tokens and the request's clinic (the use cases are in Application).</summary>
public static class IdentitySetup
{
    public static IServiceCollection AddIdentityModule(this IServiceCollection services, AuthSettings auth)
    {
        services.AddHttpContextAccessor();
        services.AddScoped<ICurrentUser, CurrentUser>();

        services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
            .AddJwtBearer(options =>
            {
                // Keep "sub", "sid", "ctx"… as they are in the token
                options.MapInboundClaims = false;
                options.TokenValidationParameters = TokenService.ValidationParameters(auth);
                options.Events = new JwtBearerEvents
                {
                    // ProblemDetails bodies (ApiProblemFactory), like every other API error
                    OnChallenge = context =>
                    {
                        context.HandleResponse();
                        return ApiProblemFactory.WriteAsync(context.HttpContext,
                            ApiProblemFactory.Create(context.HttpContext, CommonErrors.Unauthorized));
                    },
                    OnForbidden = context => ApiProblemFactory.WriteAsync(context.HttpContext,
                        ApiProblemFactory.Create(context.HttpContext, CommonErrors.Forbidden)),
                };
            });

        services.AddAuthorizationBuilder()
            .AddPolicy(AuthPolicies.ClinicContext, policy => policy
                .RequireAuthenticatedUser()
                .RequireClaim(AuthClaims.Context, ContextTypes.Clinic)
                .RequireClaim(AuthClaims.ClinicId)
                // Every clinic request: the staff member and the clinic must still be active
                .AddRequirements(new ClinicAccessRequirement()));

        return services;
    }

    /// <summary>Fills <see cref="IClinicContext"/> from the token's clinic_id (clinic contexts only). After authentication.</summary>
    public static IApplicationBuilder UseClinicFromToken(this IApplicationBuilder app) =>
        app.Use(async (http, next) =>
        {
            var currentUser = http.RequestServices.GetRequiredService<ICurrentUser>();
            http.RequestServices.GetRequiredService<ClinicContext>().ClinicId = currentUser.ClinicId;
            await next(http);
        });
}
