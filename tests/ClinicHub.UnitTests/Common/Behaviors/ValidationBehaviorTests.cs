using ClinicHub.Application.Common.Behaviors;
using ClinicHub.Application.Common.Results;
using ClinicHub.Application.Common.Validation;
using FluentValidation;
using Shouldly;

namespace ClinicHub.UnitTests.Common.Behaviors;

/// <summary>
/// The validation step of every use case (architecture § 3.5, tech overview § Conventions): all failures of every
/// validator, in declaration order, as a failed <c>Result</c> without running the handler; a rule without its own
/// error answers <c>invalidRequest</c>.
/// </summary>
[Trait("Area", "errors")]
public class ValidationBehaviorTests
{
    public sealed record Sample(string Name, int Count);

    private sealed class NameRules : AbstractValidator<Sample>
    {
        public NameRules()
        {
            RuleFor(x => x.Name).NotEmpty().WithError(CommonErrors.NameRequired);
            // No .WithError(...): FluentValidation's own code
            RuleFor(x => x.Count).GreaterThan(0);
        }
    }

    private sealed class CountRules : AbstractValidator<Sample>
    {
        public CountRules() => RuleFor(x => x.Count).LessThan(10).WithError(CommonErrors.Conflict);
    }

    private static async Task<(TResponse Response, bool HandlerRan)> Run<TResponse>(Sample request, TResponse success,
        params IValidator<Sample>[] validators)
    {
        var ran = false;
        var response = await new ValidationBehavior<Sample, TResponse>(validators).Handle(request, _ =>
        {
            ran = true;
            return Task.FromResult(success);
        }, CancellationToken.None);
        return (response, ran);
    }

    [Fact]
    public async Task A_valid_request_runs_the_handler()
    {
        var (result, ran) = await Run(new Sample("A", 1), Result.Success(), new NameRules(), new CountRules());

        ran.ShouldBeTrue();
        result.IsSuccess.ShouldBeTrue();
    }

    [Fact]
    public async Task An_invalid_request_returns_every_error_in_order_without_the_handler()
    {
        var (result, ran) = await Run(new Sample("", 50), Result.Success(), new NameRules(), new CountRules());

        ran.ShouldBeFalse();
        result.Errors.Select(e => (e.Code, e.Field, e.Type)).ShouldBe([
            ("nameRequired", "Name", ErrorType.Validation),
            ("conflict", "Count", ErrorType.Validation),
        ]);
        result.Errors[0].Description.ShouldBe(CommonErrors.NameRequired.Description);
    }

    [Fact]
    public async Task A_rule_without_its_own_error_is_an_invalid_request()
    {
        var (result, _) = await Run(new Sample("A", 0), Result.Success(), new NameRules());

        result.Errors.Select(e => (e.Code, e.Field)).ShouldBe([("invalidRequest", "Count")]);
    }

    [Fact]
    public async Task A_typed_result_fails_with_the_same_errors()
    {
        var (result, ran) = await Run(new Sample(null, 1), Result<int>.Success(5), new NameRules());

        ran.ShouldBeFalse();
        result.IsSuccess.ShouldBeFalse();
        result.Error.Code.ShouldBe("nameRequired");
    }

    [Fact]
    public async Task No_validator_means_valid()
    {
        var (result, ran) = await Run(new Sample(null, -1), Result<int>.Success(5));

        ran.ShouldBeTrue();
        result.Data.ShouldBe(5);
    }

    [Fact]
    public async Task A_request_with_validators_must_return_a_result()
    {
        await Should.ThrowAsync<InvalidOperationException>(() => Run(new Sample("", 1), "not a result", new NameRules()));
    }
}
