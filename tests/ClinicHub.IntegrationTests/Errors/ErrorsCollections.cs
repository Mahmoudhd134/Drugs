using System.Net;
using System.Text.Json.Nodes;
using ClinicHub.IntegrationTests.Harness.Hosting;
using Shouldly;

namespace ClinicHub.IntegrationTests.Errors;

// The Errors tests' parallel groups: each collection has its own database copy and app, and runs in parallel with the others

[CollectionDefinition(Name)]
public sealed class ErrorsCollection : ICollectionFixture<AppFixture>
{
    public const string Name = "errors";
}

[CollectionDefinition(Name)]
public sealed class ErrorsCollection2 : ICollectionFixture<AppFixture>
{
    public const string Name = "errors-2";
}

/// <summary>The documented ProblemDetails shape (tech overview § Errors), checked field by field.</summary>
public static class ProblemShape
{
    /// <summary>The title of each status (tech overview § Errors).</summary>
    public static readonly IReadOnlyDictionary<int, string> Titles = new Dictionary<int, string>
    {
        [400] = "Validation failed", [401] = "Unauthorized", [403] = "Forbidden", [404] = "Not found",
        [405] = "Method not allowed", [409] = "Conflict", [429] = "Too many requests", [500] = "Unexpected error",
    };

    /// <summary>The fields every error has (<c>clinicNames</c> only for the login and picker refusals).</summary>
    public static readonly string[] Fields = ["type", "title", "status", "detail", "instance", "code", "errors", "traceId"];

    /// <summary>
    /// Asserts the whole shape: the fields (and no others but <paramref name="extra"/>), type, title, status,
    /// <c>detail</c> = the first error's description, <c>instance</c> = the request path, <c>code</c> = the first error's
    /// code, every error with a code and a description, a trace id.
    /// </summary>
    public static void ShouldHaveTheShape(JsonObject body, HttpStatusCode status, string code, string path, params string[] extra)
    {
        var json = body.ToJsonString();
        var number = (int)status;
        body.Select(p => p.Key).ShouldBe(Fields.Concat(extra), ignoreOrder: true, json);
        ((string)body["type"]).ShouldBe($"https://httpstatuses.io/{number}", json);
        ((string)body["title"]).ShouldBe(Titles[number], json);
        ((int)body["status"]).ShouldBe(number, json);
        ((string)body["instance"]).ShouldBe(path, json);
        ((string)body["code"]).ShouldBe(code, json);
        var errors = body["errors"]!.AsArray();
        errors.ShouldNotBeEmpty(json);
        ((string)errors[0]!["code"]).ShouldBe(code, json);
        foreach (var error in errors)
        {
            ((string)error!["code"]).ShouldNotBeNullOrWhiteSpace(json);
            ((string)error["description"]).ShouldNotBeNullOrWhiteSpace(json);
        }
        ((string)body["detail"]).ShouldBe((string)errors[0]!["description"], json);
        ((string)body["traceId"]).ShouldNotBeNullOrWhiteSpace(json);
    }
}
