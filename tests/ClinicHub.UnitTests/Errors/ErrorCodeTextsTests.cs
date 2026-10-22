using System.Reflection;
using System.Runtime.CompilerServices;
using ClinicHub.Api.Errors;
using ClinicHub.Application.Common.Results;
using ClinicHub.UnitTests.TestSupport;
using Shouldly;

namespace ClinicHub.UnitTests.Errors;

/// <summary>
/// Every API error code has its text in both locale files, except the transport codes and <c>noContexts</c> (tech
/// overview § Conventions: codes are declared once in the feature's error class, "add new codes there and under
/// <c>errors.*</c> in both locale files"). The codes are read from the backend's error classes, so a new code without
/// a text fails here (the Vitest twin checks a hand-written list).
/// </summary>
[Trait("Area", "errors")]
public class ErrorCodeTextsTests
{
    /// <summary>tech overview § Conventions: no keys on purpose (the SPA shows <c>errors.generic</c> / its own text).</summary>
    private static readonly string[] WithoutText = ["unauthorized", "invalidRequest", "conflict", "methodNotAllowed", "unexpected", "noContexts"];

    /// <summary>The error classes the tech overview names, plus the routing-only <c>methodNotAllowed</c>.</summary>
    private static readonly string[] DocumentedClasses =
        ["CommonErrors", "DrugErrors", "ProtocolErrors", "IdentityErrors", "AccessErrors", "ClinicErrors", "RoleErrors", "StaffErrors", nameof(ApiProblemFactory)];

    /// <summary>Every <c>static</c> <see cref="Error"/> the Application and Api declare, by declaring class.</summary>
    private static readonly IReadOnlyList<(string Class, string Code)> Declared =
        new[] { typeof(CommonErrors).Assembly, typeof(ApiProblemFactory).Assembly }
            .SelectMany(a => a.GetTypes())
            .Where(t => !t.ContainsGenericParameters && t.GetCustomAttribute<CompilerGeneratedAttribute>() is null)
            .SelectMany(t => t.GetFields(BindingFlags.Static | BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.DeclaredOnly)
                .Where(f => typeof(Error).IsAssignableFrom(f.FieldType))
                .Select(f => (t.Name, ((Error)f.GetValue(null)).Code)))
            .ToList();

    [Fact]
    public void The_codes_are_read_from_every_documented_error_class()
    {
        Declared.Select(d => d.Class).Distinct().ShouldBe(DocumentedClasses, ignoreOrder: true,
            "a new error class (or one gone): name it in docs/tech/overview.md § Conventions and in DocumentedClasses here; " +
            "its codes then need errors.<code> in en.ts and ar.ts");
        Declared.Select(d => d.Code).ShouldAllBe(code => !string.IsNullOrWhiteSpace(code));
        foreach (var code in WithoutText) Declared.Select(d => d.Code).ShouldContain(code);
    }

    [Theory]
    [Trait("Case", "ERR-030")]
    [InlineData("en.ts")]
    [InlineData("ar.ts")]
    public void Every_api_error_code_has_its_text_except_the_transport_codes_and_noContexts(string localeFile)
    {
        var texts = SpaSources.LocaleKeys(localeFile);
        var codes = Declared.Select(d => d.Code).Distinct().ToList();

        var missing = codes.Except(WithoutText).Where(code => !texts.Contains($"errors.{code}")).ToList();
        var unexpected = WithoutText.Where(code => texts.Contains($"errors.{code}")).ToList();

        missing.ShouldBeEmpty($"{localeFile}: codes without errors.<code>: a new error code needs its text in en.ts and ar.ts " +
            $"(docs/tech/overview.md § Conventions), or, if it is a transport code, the doc's list and WithoutText here ({SpaSources.ReaderHint})");
        unexpected.ShouldBeEmpty($"{localeFile}: transport codes / noContexts with a text");
        codes.Except(WithoutText).Count().ShouldBeGreaterThanOrEqualTo(26);
    }
}
