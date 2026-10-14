using ClinicHub.Api.Features.Access;
using ClinicHub.Api.Shared;
using ClinicHub.Application.Common.Abstractions;
using ClinicHub.Domain.Identity;
using Microsoft.AspNetCore.Authentication.JwtBearer;

namespace ClinicHub.Api.Features.Identity;

/// <summary>DI and middleware for login, tokens and the request's clinic.</summary>
public static class IdentitySetup
{
    public static IServiceCollection AddIdentityModule(this IServiceCollection services, AppSettings settings)
    {
        services.AddHttpContextAccessor();
        services.AddSingleton(TimeProvider.System);
        services.AddScoped<ICurrentUser, CurrentUser>();
        services.AddScoped<OtpService>();
        services.AddScoped<SessionService>();
        services.AddSingleton<TokenService>();
        // The only sender so far (AppSettings.Validate refuses other modes); an SMS sender goes here
        services.AddSingleton<IOtpSender, DisplayOtpSender>();

        services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
            .AddJwtBearer(options =>
            {
                // Keep "sub", "sid", "ctx"… as they are in the token
                options.MapInboundClaims = false;
                options.TokenValidationParameters = TokenService.ValidationParameters(settings);
                options.Events = new JwtBearerEvents
                {
                    // ProblemDetails bodies, like every other API error
                    OnChallenge = async context =>
                    {
                        context.HandleResponse();
                        await Results.Problem(statusCode: StatusCodes.Status401Unauthorized)
                            .ExecuteAsync(context.HttpContext);
                    },
                    OnForbidden = context => Results.Problem(
                            title: ErrorCodes.Forbidden,
                            statusCode: StatusCodes.Status403Forbidden,
                            extensions: new Dictionary<string, object> { ["code"] = ErrorCodes.Forbidden })
                        .ExecuteAsync(context.HttpContext),
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
