using ClinicHub.Application.Common.Results;
using Microsoft.AspNetCore.Diagnostics;

namespace ClinicHub.Api.Errors;

/// <summary>
/// The last exception handler: any exception still unhandled → 500 <c>unexpected</c>. The middleware has
/// already logged it with its stack trace; the response only shows the exception in Development.
/// </summary>
public sealed class UnexpectedExceptionHandler(IHostEnvironment environment) : IExceptionHandler
{
    public async ValueTask<bool> TryHandleAsync(HttpContext httpContext, Exception exception,
        CancellationToken cancellationToken)
    {
        var error = environment.IsDevelopment()
            ? CommonErrors.Unexpected with { Description = exception.Message }
            : CommonErrors.Unexpected;
        var problem = ApiProblemFactory.Create(httpContext, error);
        if (environment.IsDevelopment())
            problem.Extensions["exception"] = exception.ToString();
        await ApiProblemFactory.WriteAsync(httpContext, problem);
        return true;
    }
}
