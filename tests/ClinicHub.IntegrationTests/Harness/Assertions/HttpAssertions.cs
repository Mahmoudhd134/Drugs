using System.Net;
using System.Text.Json;
using System.Text.Json.Nodes;
using ClinicHub.Application.Common.Results;
using Shouldly;

namespace ClinicHub.IntegrationTests.Harness.Assertions;

/// <summary>The API's JSON conventions (camelCase, as ASP.NET Core writes it).</summary>
public static class Json
{
    public static readonly JsonSerializerOptions Options = new(JsonSerializerDefaults.Web);

    public static T Read<T>(string json) => JsonSerializer.Deserialize<T>(json, Options);
}

/// <summary>An error response (ProblemDetails, docs/tech/overview.md "Errors"), as the API writes it.</summary>
public sealed record Problem(
    string Type,
    string Title,
    int Status,
    string Detail,
    string Instance,
    string Code,
    List<ProblemItem> Errors,
    List<string> ClinicNames,
    string TraceId)
{
    /// <summary>The raw body, for anything not modeled here.</summary>
    public JsonObject Body { get; init; }

    /// <summary>Asserts an error with <paramref name="code"/> on <paramref name="field"/> (camelCase, e.g. <c>items[0].dosing</c>).</summary>
    public Problem ShouldHaveError(string field, string code)
    {
        Errors.ShouldContain(e => e.Field == field && e.Code == code,
            $"expected error {code} on '{field}'; errors: {string.Join(", ", Errors.Select(e => $"{e.Code}@{e.Field}"))}");
        return this;
    }

    /// <summary>The <c>errors</c> codes, in order.</summary>
    public List<string> Codes => Errors.Select(e => e.Code).ToList();
}

public sealed record ProblemItem(string Code, string Description, string Field);

/// <summary>
/// Checks on raw JSON. Reading into a DTO can't tell a missing property from <c>null</c> (both read as null), and the
/// docs require some keys present with a null value (e.g. <c>/me</c>'s <c>context: null</c>, <c>staff: null</c>).
/// </summary>
public static class JsonAssertions
{
    /// <summary>Asserts <paramref name="key"/> (exact name, camelCase) is in the object and is JSON <c>null</c>.</summary>
    public static JsonObject ShouldHaveNull(this JsonNode node, string key)
    {
        node.ShouldNotBeNull();
        var json = node.AsObject();
        json.ContainsKey(key).ShouldBeTrue($"'{key}' is missing; expected it present and null: {json.ToJsonString()}");
        json[key].ShouldBeNull($"'{key}' should be null: {json.ToJsonString()}");
        return json;
    }
}

public static class HttpAssertions
{
    /// <summary>Asserts the status (the body is in the failure message); returns the body.</summary>
    public static async Task<string> ShouldBeAsync(this HttpResponseMessage response, HttpStatusCode status)
    {
        var body = await response.Content.ReadAsStringAsync();
        response.StatusCode.ShouldBe(status,
            $"{response.RequestMessage?.Method} {response.RequestMessage?.RequestUri?.PathAndQuery}: {body}");
        return body;
    }

    /// <summary>Asserts 200 OK; returns the body.</summary>
    public static Task<string> ShouldBeOkAsync(this HttpResponseMessage response) => response.ShouldBeAsync(HttpStatusCode.OK);

    /// <summary>Asserts a success status (2xx) and reads the JSON body as <typeparamref name="T"/>.</summary>
    public static async Task<T> ReadAsync<T>(this HttpResponseMessage response)
    {
        var body = await response.Content.ReadAsStringAsync();
        response.IsSuccessStatusCode.ShouldBeTrue(
            $"{response.RequestMessage?.Method} {response.RequestMessage?.RequestUri?.PathAndQuery} answered {(int)response.StatusCode}: {body}");
        return Json.Read<T>(body);
    }

    /// <summary>Reads any body as a JSON node (to check exact property names or absent ones).</summary>
    public static async Task<JsonNode> ReadNodeAsync(this HttpResponseMessage response) =>
        JsonNode.Parse(await response.Content.ReadAsStringAsync());

    /// <summary>
    /// Asserts a ProblemDetails with <paramref name="status"/> and first-error <paramref name="code"/> (the
    /// <c>code</c> field, also <c>errors[0].code</c>), served as <c>application/problem+json</c>.
    /// </summary>
    public static async Task<Problem> ShouldBeProblemAsync(this HttpResponseMessage response, HttpStatusCode status, string code)
    {
        var body = await response.ShouldBeAsync(status);
        response.Content.Headers.ContentType.ShouldNotBeNull(body);
        response.Content.Headers.ContentType.MediaType.ShouldBe("application/problem+json", body);
        var problem = Json.Read<Problem>(body) with { Body = JsonNode.Parse(body).AsObject() };
        problem.Status.ShouldBe((int)status, body);
        problem.Code.ShouldBe(code, body);
        problem.Errors.ShouldNotBeEmpty(body);
        problem.Errors[0].Code.ShouldBe(code, body);
        return problem;
    }

    /// <summary>Asserts a use case's result succeeded (the error codes are in the failure message); returns its data.</summary>
    public static T ShouldSucceed<T>(this Result<T> result)
    {
        result.IsSuccess.ShouldBeTrue($"use case failed: {string.Join(", ", result.Errors.Select(e => e.Code))}");
        return result.Data;
    }

    public static void ShouldSucceed(this Result result) =>
        result.IsSuccess.ShouldBeTrue($"use case failed: {string.Join(", ", result.Errors.Select(e => e.Code))}");
}
