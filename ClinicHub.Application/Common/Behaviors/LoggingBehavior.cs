using System.Diagnostics;
using ClinicHub.Application.Common.Results;
using MediatR;
using Microsoft.Extensions.Logging;

namespace ClinicHub.Application.Common.Behaviors;

/// <summary>
/// First behavior: logs the request name, its duration and, on failure, the error codes. Never the
/// request or response bodies (they may hold personal data). Exceptions are logged by the API's
/// exception handler, with the stack trace.
/// </summary>
public sealed class LoggingBehavior<TRequest, TResponse>(ILogger<LoggingBehavior<TRequest, TResponse>> logger)
    : IPipelineBehavior<TRequest, TResponse>
    where TRequest : notnull
{
    public async Task<TResponse> Handle(TRequest request, RequestHandlerDelegate<TResponse> next,
        CancellationToken cancellationToken)
    {
        var name = typeof(TRequest).Name;
        var start = Stopwatch.GetTimestamp();
        try
        {
            var response = await next(cancellationToken);
            var elapsed = Stopwatch.GetElapsedTime(start).TotalMilliseconds;
            if (response is Result { IsSuccess: false } failure)
                logger.LogInformation("{Request} failed in {ElapsedMs:0} ms: {ErrorCodes}", name, elapsed,
                    string.Join(", ", failure.Errors.Select(e => e.Code)));
            else
                logger.LogInformation("{Request} succeeded in {ElapsedMs:0} ms", name, elapsed);
            return response;
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
        {
            logger.LogInformation("{Request} was cancelled after {ElapsedMs:0} ms", name,
                Stopwatch.GetElapsedTime(start).TotalMilliseconds);
            throw;
        }
        catch (Exception exception)
        {
            logger.LogWarning("{Request} threw {Exception} after {ElapsedMs:0} ms", name, exception.GetType().Name,
                Stopwatch.GetElapsedTime(start).TotalMilliseconds);
            throw;
        }
    }
}
