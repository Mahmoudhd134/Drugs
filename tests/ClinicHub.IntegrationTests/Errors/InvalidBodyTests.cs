using System.Net;
using ClinicHub.Application.Common.Results;
using ClinicHub.IntegrationTests.Harness.Assertions;
using ClinicHub.IntegrationTests.Harness.Clients;
using ClinicHub.IntegrationTests.Harness.Hosting;
using Shouldly;

namespace ClinicHub.IntegrationTests.Errors;

/// <summary>
/// Bodies that can't be read (malformed JSON, wrong types, empty): 400 <c>invalidRequest</c>, one error per problem
/// with its field; outside Development the description is the generic one (tech overview § Errors, architecture § 6).
/// </summary>
[Collection(ErrorsCollection.Name)]
[Trait("Area", "errors")]
public class InvalidBodyTests(AppFixture app) : IntegrationTest(app)
{
    /// <summary>The generic description of <c>invalidRequest</c> (no parser message, no CLR type names).</summary>
    private static readonly string Generic = CommonErrors.InvalidRequest.Description;

    [Fact]
    [Trait("Case", "ERR-010")]
    public async Task Malformed_json_answers_invalid_request()
    {
        var owner = await OwnerAsync();

        var response = await owner.SendRawAsync(HttpMethod.Post, "/api/v1/drugs", "{\"name\": \"Tobradex\",");

        var problem = await response.ShouldBeProblemAsync(HttpStatusCode.BadRequest, "invalidRequest");
        problem.Errors.ShouldAllBe(e => e.Code == "invalidRequest");
        ProblemShape.ShouldHaveTheShape(problem.Body, HttpStatusCode.BadRequest, "invalidRequest", "/api/v1/drugs");
    }

    [Fact]
    [Trait("Case", "ERR-010")]
    public async Task Two_unreadable_values_answer_one_error_each_with_its_field()
    {
        // The parser stops at a body's first problem (one model-state error), so two independent ones come from the
        // query: each value that can't be read is its own model-state error (tech overview § Errors: one error per
        // model-state error, with its field)
        var owner = await OwnerAsync();

        var response = await owner.GetAsync("/api/v1/drugs?page=first&pageSize=many");

        var problem = await response.ShouldBeProblemAsync(HttpStatusCode.BadRequest, "invalidRequest");
        problem.Errors.Select(e => (e.Code, e.Field)).ShouldBe(
            [("invalidRequest", "page"), ("invalidRequest", "pageSize")], ignoreOrder: true);
        problem.Errors.ShouldAllBe(e => e.Description == Generic);
    }

    [Fact]
    [Trait("Case", "ERR-011")]
    public async Task A_wrong_type_answers_invalid_request_naming_the_field()
    {
        var owner = await OwnerAsync();

        var drug = await owner.SendRawAsync(HttpMethod.Post, "/api/v1/drugs", """{"name": 123}""");
        var group = await owner.SendRawAsync(HttpMethod.Post, "/api/v1/drug-groups", """{"name": "Post cataract", "items": "x"}""");

        (await drug.ShouldBeProblemAsync(HttpStatusCode.BadRequest, "invalidRequest")).ShouldHaveError("name", "invalidRequest");
        (await group.ShouldBeProblemAsync(HttpStatusCode.BadRequest, "invalidRequest")).ShouldHaveError("items", "invalidRequest");
    }

    [Fact]
    [Trait("Case", "ERR-012")]
    public async Task An_empty_body_answers_invalid_request()
    {
        var owner = await OwnerAsync();

        var drug = await owner.SendRawAsync(HttpMethod.Post, "/api/v1/drugs", "");
        var verify = await Anonymous().SendRawAsync(HttpMethod.Post, "/api/v1/auth/otp/verify", "");

        await drug.ShouldBeProblemAsync(HttpStatusCode.BadRequest, "invalidRequest");
        await verify.ShouldBeProblemAsync(HttpStatusCode.BadRequest, "invalidRequest");
    }

    [Fact]
    [Trait("Case", "ERR-013")]
    public async Task Outside_development_each_error_keeps_its_field_with_the_generic_description()
    {
        var owner = await OwnerAsync();

        var wrongType = await owner.SendRawAsync(HttpMethod.Post, "/api/v1/drugs", """{"name": 123}""");
        var malformed = await owner.SendRawAsync(HttpMethod.Post, "/api/v1/drugs", "{bad json");

        var typed = await wrongType.ShouldBeProblemAsync(HttpStatusCode.BadRequest, "invalidRequest");
        typed.ShouldHaveError("name", "invalidRequest");
        foreach (var problem in new[] { typed, await malformed.ShouldBeProblemAsync(HttpStatusCode.BadRequest, "invalidRequest") })
        {
            problem.Detail.ShouldBe(Generic);
            problem.Errors.ShouldAllBe(e => e.Description == Generic);
            var body = problem.Body.ToJsonString();
            body.ShouldNotContain("System.");
            body.ShouldNotContain("Int32");
            body.ShouldNotContain("LineNumber");
            body.ShouldNotContain("JSON value");
        }
    }

    private async Task<ApiClient> OwnerAsync() =>
        await Login.SharedAsync("owner", async () => await Login.OwnerAsync(await Data.Clinic()));
}
