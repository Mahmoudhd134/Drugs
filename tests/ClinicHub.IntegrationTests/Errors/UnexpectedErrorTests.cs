using System.Net;
using ClinicHub.Api.Features.Drugs;
using ClinicHub.Application.Common.Paging;
using ClinicHub.Application.Common.Results;
using ClinicHub.Application.Features.Catalog.Drugs;
using ClinicHub.Application.Features.Catalog.Drugs.Queries.GetDrugs;
using ClinicHub.IntegrationTests.Harness.Assertions;
using ClinicHub.IntegrationTests.Harness.Clients;
using ClinicHub.IntegrationTests.Harness.Hosting;
using MediatR;
using Microsoft.Extensions.DependencyInjection;
using Shouldly;

namespace ClinicHub.IntegrationTests.Errors;

/// <summary>An unhandled exception outside Development: 500 <c>unexpected</c>, nothing of the exception shown (tech overview § Errors).</summary>
[Collection(ErrorsCollection2.Name)]
[Trait("Area", "errors")]
public class UnexpectedErrorTests(AppFixture app) : IntegrationTest(app)
{
    private const string Secret = "Boom: connection string Host=secret-db;Password=hunter2";

    [Fact]
    [Trait("Case", "ERR-001")]
    [Trait("Case", "ERR-020")]
    public async Task An_unhandled_exception_answers_500_unexpected_without_the_exception()
    {
        var clinic = await Data.Clinic();
        // The same app where listing drugs throws (a bug or a failing dependency)
        await using var variant = App.CreateVariant(services: services =>
            services.AddTransient<IPipelineBehavior<GetDrugsQuery, Result<PagedResult<DrugDto>>>, Throwing>());
        variant.Start();
        var owner = await Login.On(variant).OwnerAsync(clinic);

        var response = await owner.GetAsync("/api/v1/drugs");

        var problem = await response.ShouldBeProblemAsync(HttpStatusCode.InternalServerError, "unexpected");
        ProblemShape.ShouldHaveTheShape(problem.Body, HttpStatusCode.InternalServerError, "unexpected", "/api/v1/drugs");
        var body = problem.Body.ToJsonString();
        body.ShouldNotContain("Boom");
        body.ShouldNotContain("hunter2");
        body.ShouldNotContain(nameof(Throwing));
        body.ShouldNotContain(" at ");
        problem.Body.ContainsKey("exception").ShouldBeFalse();
        await (await owner.GetAsync("/api/v1/drug-groups")).ShouldBeOkAsync();
    }

    [Fact]
    [Trait("Case", "ERR-014")]
    [Trait("Case", "ERR-021")]
    public async Task In_development_the_parser_message_and_the_exception_are_shown()
    {
        // A clinic first: the Development startup seed only fills an empty database
        var clinic = await Data.Clinic();
        await using var variant = App.CreateVariant(new Dictionary<string, string> { ["environment"] = "Development" }, services =>
            services.AddTransient<IPipelineBehavior<GetDrugsQuery, Result<PagedResult<DrugDto>>>, Throwing>());
        variant.Start();
        var owner = await Login.On(variant).OwnerAsync(clinic);

        const string body = """{"name": 123}""";
        var malformed = await owner.SendRawAsync(HttpMethod.Post, "/api/v1/drugs", body);
        var failing = await owner.GetAsync("/api/v1/drugs");

        var invalid = await malformed.ShouldBeProblemAsync(HttpStatusCode.BadRequest, "invalidRequest");
        var error = invalid.Errors.ShouldHaveSingleItem();
        error.Field.ShouldBe("name");
        // The parser's own message for this body (architecture § 6: "it names CLR types"), not a fixed text
        error.Description.ShouldBe(ParserMessage(body));
        error.Description.ShouldContain(typeof(SaveDrugRequest).FullName);
        var unexpected = await failing.ShouldBeProblemAsync(HttpStatusCode.InternalServerError, "unexpected");
        unexpected.Detail.ShouldBe(Secret);
        var exception = (string)unexpected.Body["exception"];
        exception.ShouldNotBeNull();
        exception.ShouldContain(nameof(InvalidOperationException));
        exception.ShouldContain(Secret);
        exception.ShouldContain(nameof(Throwing));
    }

    /// <summary>What System.Text.Json (the API's parser, web defaults) says about <paramref name="body"/> as a drug body.</summary>
    private static string ParserMessage(string body) =>
        Should.Throw<System.Text.Json.JsonException>(() => Json.Read<SaveDrugRequest>(body)).Message;

    private sealed class Throwing : IPipelineBehavior<GetDrugsQuery, Result<PagedResult<DrugDto>>>
    {
        public Task<Result<PagedResult<DrugDto>>> Handle(GetDrugsQuery request, RequestHandlerDelegate<Result<PagedResult<DrugDto>>> next,
            CancellationToken cancellationToken) => throw new InvalidOperationException(Secret);
    }
}
