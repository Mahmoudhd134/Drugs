using ClinicHub.Api.Errors;
using ClinicHub.Application.Common.Results;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Shouldly;

namespace ClinicHub.UnitTests.Errors;

/// <summary>
/// The one ProblemDetails shape (tech overview § Errors, architecture § 6): status from the error type (429/405 by
/// code), title by status, <c>code</c> = the first error's, <c>errors</c> with camelCase fields, <c>clinicNames</c> only
/// for a <c>ClinicError</c>, and bare statuses completed with a code.
/// </summary>
[Trait("Area", "errors")]
public class ApiProblemFactoryTests
{
    private static HttpContext Request(string path = "/api/v1/drugs", int status = 200)
    {
        var context = new DefaultHttpContext();
        context.Request.Path = path;
        context.Response.StatusCode = status;
        context.TraceIdentifier = "trace-1";
        return context;
    }

    private static List<ProblemError> Errors(ProblemDetails problem) => (List<ProblemError>)problem.Extensions["errors"];

    [Theory]
    [Trait("Case", "ERR-009")]
    [InlineData(400, "invalidRequest")]
    [InlineData(401, "unauthorized")]
    [InlineData(403, "forbidden")]
    [InlineData(404, "notFound")]
    [InlineData(405, "methodNotAllowed")]
    [InlineData(409, "conflict")]
    [InlineData(415, "invalidRequest")]
    [InlineData(422, "invalidRequest")]
    [InlineData(429, "tooManyRequests")]
    [InlineData(500, "unexpected")]
    [InlineData(503, "unexpected")]
    public void A_bare_status_is_completed_with_its_code(int status, string code)
    {
        var problem = ApiProblemFactory.Complete(new ProblemDetails { Status = status }, Request());

        problem.Extensions["code"].ShouldBe(code);
        Errors(problem).Select(e => e.Code).ShouldBe([code]);
        problem.Detail.ShouldNotBeNullOrWhiteSpace();
        problem.Type.ShouldBe($"https://httpstatuses.io/{status}");
        problem.Instance.ShouldBe("/api/v1/drugs");
        problem.Extensions["traceId"].ShouldNotBeNull();
    }

    [Fact]
    [Trait("Case", "ERR-009")]
    public void A_problem_without_a_status_takes_the_response_status()
    {
        var problem = ApiProblemFactory.Complete(new ProblemDetails(), Request(status: 404));

        problem.Status.ShouldBe(404);
        problem.Extensions["code"].ShouldBe("notFound");
    }

    [Fact]
    public void A_problem_with_a_code_keeps_it_and_its_detail()
    {
        var problem = new ProblemDetails { Status = 403, Detail = "Custom detail." };
        problem.Extensions["code"] = "noAccess";

        ApiProblemFactory.Complete(problem, Request());

        problem.Extensions["code"].ShouldBe("noAccess");
        problem.Detail.ShouldBe("Custom detail.");
        Errors(problem).ShouldBe([new ProblemError("noAccess", "Custom detail.", null)]);
    }

    [Fact]
    public void A_problem_with_a_code_and_no_detail_gets_the_reason_phrase()
    {
        var problem = new ProblemDetails { Status = 409 };
        problem.Extensions["code"] = "roleInUse";

        ApiProblemFactory.Complete(problem, Request());

        Errors(problem).ShouldBe([new ProblemError("roleInUse", "Conflict", null)]);
    }

    [Fact]
    public async Task A_problem_is_written_as_problem_json()
    {
        var context = Request();
        context.Response.Body = new MemoryStream();

        await ApiProblemFactory.WriteAsync(context, ApiProblemFactory.Create(context, CommonErrors.NameRequired with { Field = "Name" }));

        context.Response.StatusCode.ShouldBe(400);
        context.Response.ContentType.ShouldBe("application/problem+json; charset=utf-8");
        context.Response.Body.Position = 0;
        var json = System.Text.Json.JsonDocument.Parse(context.Response.Body).RootElement;
        json.GetProperty("status").GetInt32().ShouldBe(400);
        json.GetProperty("title").GetString().ShouldBe("Validation failed");
        json.GetProperty("code").GetString().ShouldBe("nameRequired");
        json.GetProperty("errors")[0].GetProperty("field").GetString().ShouldBe("name");
        json.GetProperty("instance").GetString().ShouldBe("/api/v1/drugs");
        json.GetProperty("traceId").GetString().ShouldNotBeNullOrEmpty();
    }

    [Fact]
    public void A_field_less_error_has_no_field_in_the_json()
    {
        var json = System.Text.Json.JsonSerializer.Serialize(new ProblemError("conflict", "Conflict.", null),
            new System.Text.Json.JsonSerializerOptions(System.Text.Json.JsonSerializerDefaults.Web));

        json.ShouldBe("""{"code":"conflict","description":"Conflict."}""");
    }

    [Fact]
    public void The_mvc_result_is_problem_json_with_the_status()
    {
        var problem = ApiProblemFactory.Create(Request(), CommonErrors.Forbidden);

        var result = ApiProblemFactory.ToActionResult(problem);

        result.StatusCode.ShouldBe(403);
        result.ContentTypes.ShouldBe(["application/problem+json"]);
        result.Value.ShouldBeSameAs(problem);
    }

    [Fact]
    public void Completing_twice_changes_nothing()
    {
        var problem = ApiProblemFactory.Complete(new ProblemDetails { Status = 409 }, Request());
        var errors = Errors(problem);

        ApiProblemFactory.Complete(problem, Request());

        problem.Extensions["code"].ShouldBe("conflict");
        Errors(problem).ShouldBeSameAs(errors);
    }

    [Theory]
    [InlineData(ErrorType.Validation, 400, "Validation failed")]
    [InlineData(ErrorType.Unauthorized, 401, "Unauthorized")]
    [InlineData(ErrorType.Forbidden, 403, "Forbidden")]
    [InlineData(ErrorType.NotFound, 404, "Not found")]
    [InlineData(ErrorType.Conflict, 409, "Conflict")]
    [InlineData(ErrorType.Failure, 500, "Unexpected error")]
    public void The_status_and_title_come_from_the_error_type(ErrorType type, int status, string title)
    {
        var problem = ApiProblemFactory.Create(Request(), new Error("someCode", "Some description.", type));

        problem.Status.ShouldBe(status);
        problem.Title.ShouldBe(title);
        problem.Type.ShouldBe($"https://httpstatuses.io/{status}");
        problem.Detail.ShouldBe("Some description.");
        problem.Extensions["code"].ShouldBe("someCode");
    }

    [Fact]
    public void Too_many_requests_and_method_not_allowed_have_their_own_status()
    {
        var tooMany = ApiProblemFactory.Create(Request(), new TooManyRequestsError(40));
        tooMany.Status.ShouldBe(429);
        tooMany.Title.ShouldBe("Too many requests");
        tooMany.Extensions["code"].ShouldBe("tooManyRequests");

        var method = ApiProblemFactory.Create(Request(), ApiProblemFactory.MethodNotAllowed);
        method.Status.ShouldBe(405);
        method.Title.ShouldBe("Method not allowed");
        method.Extensions["code"].ShouldBe("methodNotAllowed");
    }

    [Fact]
    public void Code_is_the_first_error_and_errors_lists_them_all_with_camel_case_fields()
    {
        var problem = ApiProblemFactory.Create(Request(), [
            CommonErrors.NameRequired with { Field = "Name" },
            new Error("invalidDosing", "The dosing of a protocol line is not valid.", ErrorType.Validation, "Items[0].Dosing"),
            new Error("invalidPhone", "The phone number is not valid.", ErrorType.Validation, "Owner.Phone"),
            CommonErrors.InvalidRequest with { Field = "$.items" },
            CommonErrors.InvalidRequest with { Field = "$" },
            CommonErrors.Conflict,
        ]);

        problem.Status.ShouldBe(400);
        problem.Extensions["code"].ShouldBe("nameRequired");
        problem.Detail.ShouldBe("The name is required.");
        Errors(problem).Select(e => (e.Code, e.Field)).ShouldBe([
            ("nameRequired", "name"),
            ("invalidDosing", "items[0].dosing"),
            ("invalidPhone", "owner.phone"),
            ("invalidRequest", "items"),
            ("invalidRequest", null),
            ("conflict", null),
        ]);
        Errors(problem).ShouldAllBe(e => !string.IsNullOrEmpty(e.Description));
    }

    [Fact]
    public void A_status_can_be_forced()
    {
        ApiProblemFactory.Create(Request(), CommonErrors.InvalidRequest, 415).Status.ShouldBe(415);
    }

    [Fact]
    public void No_error_at_all_is_unexpected()
    {
        var problem = ApiProblemFactory.Create(Request(), []);

        problem.Status.ShouldBe(500);
        problem.Extensions["code"].ShouldBe("unexpected");
    }

    [Fact]
    public void Clinic_names_are_sent_only_for_a_clinic_error_first()
    {
        var suspended = new Error("clinicSuspended", "The clinic is suspended.", ErrorType.Forbidden);
        var named = new ClinicError(suspended, ["A", "B"]);

        var problem = ApiProblemFactory.Create(Request(), named);
        problem.Status.ShouldBe(403);
        problem.Extensions["code"].ShouldBe("clinicSuspended");
        problem.Extensions["clinicNames"].ShouldBe(new[] { "A", "B" });

        ApiProblemFactory.Create(Request(), suspended).Extensions.ShouldNotContainKey("clinicNames");
        ApiProblemFactory.Create(Request(), [CommonErrors.Forbidden, named]).Extensions.ShouldNotContainKey("clinicNames");
    }

    [Fact]
    public void Bare_statuses_map_to_the_common_errors()
    {
        ApiProblemFactory.ErrorForStatus(401).ShouldBe(CommonErrors.Unauthorized);
        ApiProblemFactory.ErrorForStatus(403).ShouldBe(CommonErrors.Forbidden);
        ApiProblemFactory.ErrorForStatus(404).ShouldBe(CommonErrors.NotFound);
        ApiProblemFactory.ErrorForStatus(409).ShouldBe(CommonErrors.Conflict);
        ApiProblemFactory.ErrorForStatus(429).ShouldBe(CommonErrors.TooManyRequests);
        ApiProblemFactory.ErrorForStatus(500).ShouldBe(CommonErrors.Unexpected);
        ApiProblemFactory.ErrorForStatus(499).ShouldBe(CommonErrors.InvalidRequest);
        ApiProblemFactory.CreateForStatus(Request(), 404).Extensions["code"].ShouldBe("notFound");
        ApiProblemFactory.CreateForStatus(Request(), 404).Status.ShouldBe(404);
    }
}
