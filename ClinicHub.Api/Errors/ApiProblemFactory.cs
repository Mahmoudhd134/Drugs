using System.Diagnostics;
using System.Text.Json;
using System.Text.Json.Serialization;
using ClinicHub.Application.Common.Results;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.WebUtilities;

namespace ClinicHub.Api.Errors;

/// <summary>One error of a ProblemDetails' <c>errors</c> list.</summary>
/// <param name="Field">Camel-case request property (<c>name</c>, <c>items[0].dosing</c>), when known.</param>
public sealed record ProblemError(
    string Code,
    string Description,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] string Field);

/// <summary>
/// The only place that builds error responses: every error source (Result failures, 401, 403, invalid
/// bodies, 404/405, unexpected exceptions and the AddProblemDetails safety net) answers the same
/// RFC 9457 shape: <c>type, title, status, detail, instance, code, errors[], traceId</c>.
/// <c>code</c> (the first error's code) is what the SPA translates (<c>errors.{code}</c>).
/// </summary>
public static class ApiProblemFactory
{
    public const string ContentType = "application/problem+json";

    /// <summary>The route exists, but not for this HTTP method. Routing only (no use case returns it).</summary>
    public static readonly Error MethodNotAllowed =
        new("methodNotAllowed", "The HTTP method is not allowed on this route.", ErrorType.Failure);

    /// <summary>The HTTP status of an error: by its type, except the codes with a status of their own.</summary>
    public static int StatusOf(Error error) =>
        error.Code == CommonErrors.TooManyRequests.Code ? StatusCodes.Status429TooManyRequests
        : error.Code == MethodNotAllowed.Code ? StatusCodes.Status405MethodNotAllowed
        : error.Type switch
        {
            ErrorType.Validation => StatusCodes.Status400BadRequest,
            ErrorType.Unauthorized => StatusCodes.Status401Unauthorized,
            ErrorType.Forbidden => StatusCodes.Status403Forbidden,
            ErrorType.NotFound => StatusCodes.Status404NotFound,
            ErrorType.Conflict => StatusCodes.Status409Conflict,
            _ => StatusCodes.Status500InternalServerError,
        };

    /// <summary>The common error for a bare status (no body, or a problem without a code).</summary>
    public static Error ErrorForStatus(int status) => status switch
    {
        StatusCodes.Status401Unauthorized => CommonErrors.Unauthorized,
        StatusCodes.Status403Forbidden => CommonErrors.Forbidden,
        StatusCodes.Status404NotFound => CommonErrors.NotFound,
        StatusCodes.Status405MethodNotAllowed => MethodNotAllowed,
        StatusCodes.Status409Conflict => CommonErrors.Conflict,
        StatusCodes.Status429TooManyRequests => CommonErrors.TooManyRequests,
        >= 500 => CommonErrors.Unexpected,
        _ => CommonErrors.InvalidRequest,
    };

    /// <summary>A problem for one or more errors; the status comes from the first unless given.</summary>
    public static ProblemDetails Create(HttpContext httpContext, IReadOnlyList<Error> errors, int? status = null)
    {
        if (errors is not { Count: > 0 })
            errors = [CommonErrors.Unexpected];
        var first = errors[0];
        var problem = new ProblemDetails { Status = status ?? StatusOf(first), Detail = first.Description };
        problem.Extensions["code"] = first.Code;
        problem.Extensions["errors"] = errors
            .Select(e => new ProblemError(e.Code, e.Description, FieldName(e.Field)))
            .ToList();
        return Complete(problem, httpContext);
    }

    public static ProblemDetails Create(HttpContext httpContext, Error error, int? status = null) =>
        Create(httpContext, [error], status);

    /// <summary>A problem for a bare status (<see cref="ErrorForStatus"/>).</summary>
    public static ProblemDetails CreateForStatus(HttpContext httpContext, int status) =>
        Create(httpContext, ErrorForStatus(status), status);

    /// <summary>
    /// Fills what a problem lacks, so one built elsewhere (MVC's <c>Problem()</c>, <c>Unauthorized()</c>…)
    /// gets the same shape: <c>code</c> and <c>errors</c> from its status, and the standard type, title,
    /// instance and traceId. Idempotent.
    /// </summary>
    public static ProblemDetails Complete(ProblemDetails problem, HttpContext httpContext)
    {
        var status = problem.Status ?? httpContext.Response.StatusCode;
        problem.Status = status;
        if (problem.Extensions.TryGetValue("code", out var code) && code is not null)
        {
            problem.Extensions.TryAdd("errors", new List<ProblemError>
                { new(code.ToString(), problem.Detail ?? ReasonPhrases.GetReasonPhrase(status), null) });
        }
        else
        {
            var error = ErrorForStatus(status);
            problem.Extensions["code"] = error.Code;
            problem.Extensions["errors"] = new List<ProblemError> { new(error.Code, problem.Detail ?? error.Description, null) };
            problem.Detail ??= error.Description;
        }

        problem.Type = $"https://httpstatuses.io/{status}";
        problem.Title = TitleOf(status);
        problem.Instance ??= httpContext.Request.Path;
        problem.Extensions["traceId"] = Activity.Current?.Id ?? httpContext.TraceIdentifier;
        return problem;
    }

    /// <summary>Writes the problem as the response (status + <c>application/problem+json</c>), outside MVC.</summary>
    public static Task WriteAsync(HttpContext httpContext, ProblemDetails problem)
    {
        httpContext.Response.StatusCode = problem.Status ?? StatusCodes.Status500InternalServerError;
        return httpContext.Response.WriteAsJsonAsync(problem, JsonOptions, $"{ContentType}; charset=utf-8");
    }

    /// <summary>The MVC result for the problem.</summary>
    public static ObjectResult ToActionResult(ProblemDetails problem) =>
        new(problem) { StatusCode = problem.Status, ContentTypes = { ContentType } };

    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    private static string TitleOf(int status) => status switch
    {
        StatusCodes.Status400BadRequest => "Validation failed",
        StatusCodes.Status401Unauthorized => "Unauthorized",
        StatusCodes.Status403Forbidden => "Forbidden",
        StatusCodes.Status404NotFound => "Not found",
        StatusCodes.Status405MethodNotAllowed => "Method not allowed",
        StatusCodes.Status409Conflict => "Conflict",
        StatusCodes.Status429TooManyRequests => "Too many requests",
        StatusCodes.Status500InternalServerError => "Unexpected error",
        _ => ReasonPhrases.GetReasonPhrase(status),
    };

    /// <summary>
    /// <c>Items[0].Dosing</c> → <c>items[0].dosing</c>, like the JSON body; model-state JSON paths lose their
    /// <c>$.</c> (<c>$</c> alone = the whole body → no field).
    /// </summary>
    private static string FieldName(string field)
    {
        field = field?.TrimStart('$').TrimStart('.');
        return string.IsNullOrEmpty(field)
            ? null
            : string.Join('.', field.Split('.').Select(JsonNamingPolicy.CamelCase.ConvertName));
    }
}
