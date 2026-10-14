using System.Reflection;
using ClinicHub.Application.Common.Results;
using FluentValidation;
using MediatR;

namespace ClinicHub.Application.Common.Behaviors;

/// <summary>
/// Runs every FluentValidation validator of the request and, if any rule fails, returns
/// <b>all</b> the failures as a failed <see cref="Result"/> without calling the handler. Each failure
/// becomes <c>Error(code, message, Validation, propertyName)</c>; rules set their code with
/// <c>.WithError(...)</c>, in the order the API should report them (the first is the response's <c>code</c>).
/// </summary>
public sealed class ValidationBehavior<TRequest, TResponse>(IEnumerable<IValidator<TRequest>> validators)
    : IPipelineBehavior<TRequest, TResponse>
    where TRequest : notnull
{
    public async Task<TResponse> Handle(TRequest request, RequestHandlerDelegate<TResponse> next,
        CancellationToken cancellationToken)
    {
        var errors = new List<Error>();
        // One after the other, in registration order: validators may share the scoped DbContext
        foreach (var validator in validators)
        {
            var result = await validator.ValidateAsync(new ValidationContext<TRequest>(request), cancellationToken);
            errors.AddRange(result.Errors.Select(f =>
                new Error(ApiCode(f.ErrorCode), f.ErrorMessage, ErrorType.Validation, f.PropertyName)));
        }

        return errors.Count == 0 ? await next(cancellationToken) : ResultFailure<TResponse>.From(errors);
    }

    /// <summary>A rule without <c>.WithError(...)</c> has FluentValidation's code (e.g. <c>PredicateValidator</c>): send <c>invalidRequest</c>.</summary>
    private static string ApiCode(string code) =>
        string.IsNullOrEmpty(code) || code.EndsWith("Validator", StringComparison.Ordinal)
            ? CommonErrors.InvalidRequest.Code
            : code;
}

/// <summary>Builds a failed <typeparamref name="TResponse"/> (<see cref="Result"/> or <see cref="Result{TData}"/>).</summary>
internal static class ResultFailure<TResponse>
{
    private static readonly Func<IEnumerable<Error>, TResponse> Create = Build();

    public static TResponse From(IEnumerable<Error> errors) => Create(errors);

    private static Func<IEnumerable<Error>, TResponse> Build()
    {
        var type = typeof(TResponse);
        if (type == typeof(Result))
            return errors => (TResponse)(object)Result.Failure(errors);
        if (type.IsGenericType && type.GetGenericTypeDefinition() == typeof(Result<>))
        {
            var failure = type.GetMethod(nameof(Result.Failure),
                BindingFlags.Public | BindingFlags.Static | BindingFlags.DeclaredOnly, [typeof(IEnumerable<Error>)]);
            return errors => (TResponse)failure.Invoke(null, [errors]);
        }
        return _ => throw new InvalidOperationException(
            $"{type.Name} is not a Result: requests with validators must return Result or Result<T>.");
    }
}
