using ClinicHub.Api.Errors;
using ClinicHub.Application.Common.Results;
using Microsoft.AspNetCore.Mvc;

namespace ClinicHub.Api;

public static class DependencyInjection
{
    /// <summary>Controllers and the error sources that are not tied to a module (all through <see cref="ApiProblemFactory"/>).</summary>
    public static IServiceCollection AddApi(this IServiceCollection services)
    {
        services.AddControllers()
            .ConfigureApiBehaviorOptions(options =>
                // Malformed JSON or wrong types, before any use case runs: 400 invalidRequest, one error per problem
                options.InvalidModelStateResponseFactory = context =>
                {
                    var errors = context.ModelState
                        .Where(entry => entry.Value is { Errors.Count: > 0 })
                        .SelectMany(entry => entry.Value.Errors.Select(error => CommonErrors.InvalidRequest with
                        {
                            Description = string.IsNullOrWhiteSpace(error.ErrorMessage)
                                ? CommonErrors.InvalidRequest.Description
                                : error.ErrorMessage,
                            Field = entry.Key,
                        }))
                        .ToList();
                    return ApiProblemFactory.ToActionResult(ApiProblemFactory.Create(context.HttpContext,
                        errors.Count > 0 ? errors : [CommonErrors.InvalidRequest]));
                });

        // Safety net: any other ProblemDetails (MVC's Problem(), Unauthorized()…) gets the same shape
        services.AddProblemDetails(options =>
            options.CustomizeProblemDetails = context =>
                ApiProblemFactory.Complete(context.ProblemDetails, context.HttpContext));

        // After the modules' handlers (e.g. the Access 403s): whatever is left is unexpected
        services.AddExceptionHandler<UnexpectedExceptionHandler>();
        return services;
    }

    /// <summary>A 4xx/5xx without a body (unknown route 404, 405…) gets a ProblemDetails body.</summary>
    public static IApplicationBuilder UseProblemStatusCodePages(this IApplicationBuilder app) =>
        app.UseStatusCodePages(context => ApiProblemFactory.WriteAsync(context.HttpContext,
            ApiProblemFactory.CreateForStatus(context.HttpContext, context.HttpContext.Response.StatusCode)));
}
