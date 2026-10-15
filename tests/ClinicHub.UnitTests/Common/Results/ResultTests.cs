using ClinicHub.Application.Common.Results;
using Shouldly;

namespace ClinicHub.UnitTests.Common.Results;

/// <summary>
/// Use case outcomes (architecture § 3.3, tech overview § Conventions): success, or one or more errors (never an
/// exception for an expected failure); a failure carries at least one error and no data.
/// </summary>
[Trait("Area", "errors")]
public class ResultTests
{
    [Fact]
    public void Success_has_no_errors()
    {
        var result = Result.Success();

        result.IsSuccess.ShouldBeTrue();
        result.Errors.ShouldBeEmpty();
        result.Error.ShouldBeNull();
    }

    [Fact]
    public void A_failure_keeps_every_error_in_order()
    {
        Result result = Result.Failure([CommonErrors.NameRequired, CommonErrors.InvalidText]);

        result.IsSuccess.ShouldBeFalse();
        result.Errors.ShouldBe([CommonErrors.NameRequired, CommonErrors.InvalidText]);
        result.Error.ShouldBe(CommonErrors.NameRequired, "the first one");
    }

    [Fact]
    public void An_error_converts_to_a_failure()
    {
        Result result = CommonErrors.Forbidden;
        Result<int> typed = CommonErrors.NotFound;

        result.Error.ShouldBe(CommonErrors.Forbidden);
        typed.Error.ShouldBe(CommonErrors.NotFound);
        Result.Failure(CommonErrors.Conflict).Errors.ShouldBe([CommonErrors.Conflict]);
    }

    [Fact]
    public void A_failure_needs_at_least_one_error_and_no_null()
    {
        Should.Throw<ArgumentException>(() => Result.Failure([]));
        Should.Throw<ArgumentException>(() => Result.Failure((IEnumerable<Error>)null));
        Should.Throw<ArgumentException>(() => Result.Failure([CommonErrors.Conflict, null]));
        Should.Throw<ArgumentException>(() => Result.Failure((Error)null));
        Should.Throw<ArgumentException>(() => Result<int>.Failure([]));
        Should.Throw<ArgumentException>(() => Result<int>.Failure((Error)null));
    }

    [Fact]
    public void Data_is_only_on_success()
    {
        Result<string> success = "data";
        success.IsSuccess.ShouldBeTrue();
        success.Data.ShouldBe("data");
        Result<string>.Success(null).Data.ShouldBeNull();

        var failure = Result<string>.Failure([CommonErrors.NotFound, CommonErrors.Conflict]);
        failure.Errors.Count.ShouldBe(2);
        Should.Throw<InvalidOperationException>(() => failure.Data).Message.ShouldContain("notFound");
    }

    [Fact]
    public void A_clinic_error_names_the_clinics_and_keeps_the_error()
    {
        var suspended = new Error("clinicSuspended", "The clinic is suspended.", ErrorType.Forbidden, "x");

        var named = new ClinicError(suspended, ["A", "B"]);

        named.Code.ShouldBe("clinicSuspended");
        named.Description.ShouldBe("The clinic is suspended.");
        named.Type.ShouldBe(ErrorType.Forbidden);
        named.Field.ShouldBe("x");
        named.ClinicNames.ShouldBe(["A", "B"]);
    }

    [Fact]
    public void Too_many_requests_carries_the_wait()
    {
        var error = new TooManyRequestsError(40);

        error.Code.ShouldBe("tooManyRequests");
        error.RetryAfterSeconds.ShouldBe(40);
        error.Type.ShouldBe(CommonErrors.TooManyRequests.Type);
    }

    [Fact]
    public void The_common_codes_are_the_api_contract()
    {
        new[]
        {
            CommonErrors.Unauthorized, CommonErrors.Forbidden, CommonErrors.NotFound, CommonErrors.InvalidRequest,
            CommonErrors.Conflict, CommonErrors.TooManyRequests, CommonErrors.Unexpected, CommonErrors.NameRequired,
            CommonErrors.NameInvalid, CommonErrors.NameTooLong, CommonErrors.InvalidText,
        }.Select(e => e.Code).ShouldBe([
            "unauthorized", "forbidden", "notFound", "invalidRequest", "conflict", "tooManyRequests", "unexpected",
            "nameRequired", "nameInvalid", "nameTooLong", "invalidText",
        ]);
    }
}
