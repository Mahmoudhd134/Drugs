using ClinicHub.Api.Errors;
using ClinicHub.Application.Common.Behaviors;
using ClinicHub.Application.Common.Results;
using FluentValidation;
using Microsoft.AspNetCore.Http;

namespace ClinicHub.UnitTests.TestSupport;

/// <summary>One entry of a ProblemDetails' <c>errors</c>, as the API sends it.</summary>
public sealed record ApiFieldError(string Code, string Field);

/// <summary>What the API would answer for a request that a validator rejects (or <see cref="IsValid"/>).</summary>
public sealed record ApiValidationAnswer(int? Status, string Code, IReadOnlyList<ApiFieldError> Errors)
{
    public bool IsValid => Status is null;
}

/// <summary>
/// Runs a validator the way the API does: through the real <see cref="ValidationBehavior{TRequest,TResponse}"/>
/// (codes, report order) and the real <see cref="ApiProblemFactory"/> (status, camelCase <c>field</c>), so a validator
/// test asserts the codes and fields the API documents, without HTTP.
/// </summary>
public static class ApiValidation
{
    public static ApiValidationAnswer Run<TRequest>(IValidator<TRequest> validator, TRequest request)
    {
        var behavior = new ValidationBehavior<TRequest, Result>([validator]);
        var result = behavior.Handle(request, _ => Task.FromResult(Result.Success()), CancellationToken.None)
            .GetAwaiter().GetResult();
        if (result.IsSuccess)
            return new ApiValidationAnswer(null, null, []);

        var problem = ApiProblemFactory.Create(new DefaultHttpContext(), result.Errors);
        var errors = ((IEnumerable<ProblemError>)problem.Extensions["errors"])
            .Select(e => new ApiFieldError(e.Code, e.Field))
            .ToList();
        return new ApiValidationAnswer(problem.Status, (string)problem.Extensions["code"], errors);
    }
}
