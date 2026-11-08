using System.Text;
using System.Text.Json;
using ClinicHub.Application.Features.Forms.Definitions;
using ClinicHub.Application.Features.Forms.Definitions.Commands.CreateForm;
using ClinicHub.Application.Features.Forms.Definitions.Commands.SaveForm;
using ClinicHub.UnitTests.TestSupport;
using Shouldly;

namespace ClinicHub.UnitTests.Forms;

/// <summary><c>POST /admin/forms</c>'s outer shell (contract § 2).</summary>
[Trait("Area", "forms")]
public class CreateFormCommandValidatorTests : FormCommandValidatorRules
{
    protected override ApiValidationAnswer Validate(string name, JsonElement? definition) =>
        ApiValidation.Run(new CreateFormCommandValidator(), new CreateFormCommand(name, definition));
}

/// <summary><c>PUT /admin/forms/{id}</c>'s outer shell (contract § 2).</summary>
[Trait("Area", "forms")]
public class SaveFormCommandValidatorTests : FormCommandValidatorRules
{
    protected override ApiValidationAnswer Validate(string name, JsonElement? definition) =>
        ApiValidation.Run(new SaveFormCommandValidator(), new SaveFormCommand(1, name, definition));
}

/// <summary>The rules the two validators share: every test runs on each, so each carries both cases.</summary>
public abstract class FormCommandValidatorRules
{
    private const int Limit = FormLimits.DefinitionMaxBytes;

    protected abstract ApiValidationAnswer Validate(string name, JsonElement? definition);

    private ApiValidationAnswer ValidateJson(string name, string json)
    {
        using var document = JsonDocument.Parse(json);
        return Validate(name, document.RootElement.Clone());
    }

    private static void ShouldRefuseTheDefinition(ApiValidationAnswer answer, string code)
    {
        answer.Status.ShouldBe(400);
        answer.Code.ShouldBe(code);
        answer.Errors.ShouldBe([new ApiFieldError(code, "definition")]);
    }

    private static string ObjectOfBytes(int bytes) => $$"""{"k":"{{new string('x', bytes - 8)}}"}""";

    [Theory]
    [Trait("Case", "FRM-060")]
    [Trait("Case", "FRM-061")]
    [InlineData("{}")]
    [InlineData("""{"schemaVersion":99}""")]
    [InlineData("""{"any":[1,"two",{"three":null}],"PascalKey":1e400}""")]
    public void A_name_and_any_object_are_valid(string json)
    {
        ValidateJson("Form", json).IsValid.ShouldBeTrue();
    }

    [Theory]
    [Trait("Case", "FRM-060")]
    [Trait("Case", "FRM-061")]
    [InlineData(null, "nameRequired")]
    [InlineData("", "nameRequired")]
    [InlineData("   ", "nameRequired")]
    [InlineData("a\0b", "nameInvalid")]
    [InlineData("a\nb", "nameInvalid")]
    [InlineData("a\u202Eb", "nameInvalid")]
    public void Name_errors_are_on_the_name(string name, string code)
    {
        var answer = ValidateJson(name, "{}");

        answer.Status.ShouldBe(400);
        answer.Code.ShouldBe(code);
        answer.Errors.ShouldBe([new ApiFieldError(code, "name")]);
    }

    [Fact]
    [Trait("Case", "FRM-060")]
    [Trait("Case", "FRM-061")]
    public void The_name_is_at_most_256_characters_once_trimmed()
    {
        ValidateJson(Text.OfLength(256), "{}").IsValid.ShouldBeTrue();
        ValidateJson($"  {Text.OfLength(256)}  ", "{}").IsValid.ShouldBeTrue();

        var answer = ValidateJson(Text.OfLength(257), "{}");
        answer.Status.ShouldBe(400);
        answer.Errors.ShouldBe([new ApiFieldError("nameTooLong", "name")]);
    }

    [Fact]
    [Trait("Case", "FRM-060")]
    [Trait("Case", "FRM-061")]
    public void A_missing_definition_is_invalid()
    {
        ShouldRefuseTheDefinition(Validate("Form", null), "formDefinitionInvalid");
    }

    [Theory]
    [Trait("Case", "FRM-060")]
    [Trait("Case", "FRM-061")]
    [InlineData("null")]
    [InlineData("\"text\"")]
    [InlineData("5")]
    [InlineData("true")]
    [InlineData("false")]
    [InlineData("[]")]
    public void A_definition_that_is_not_an_object_is_invalid(string json)
    {
        ShouldRefuseTheDefinition(ValidateJson("Form", json), "formDefinitionInvalid");
    }

    [Fact]
    [Trait("Case", "FRM-060")]
    [Trait("Case", "FRM-061")]
    public void A_definition_that_is_not_an_object_is_only_invalid_whatever_its_size()
    {
        ShouldRefuseTheDefinition(ValidateJson("Form", $"\"{new string('x', Limit + 1)}\""), "formDefinitionInvalid");
    }

    [Theory]
    [Trait("Case", "FRM-060")]
    [Trait("Case", "FRM-061")]
    [InlineData("""{"k":"\ud800"}""")]
    [InlineData("""{"\ud800":1}""")]
    [InlineData("""{"n":1e99999999999}""")]
    public void An_object_the_server_could_not_read_back_is_invalid(string json)
    {
        ShouldRefuseTheDefinition(ValidateJson("Form", json), "formDefinitionInvalid");
    }

    [Fact]
    [Trait("Case", "FRM-060")]
    [Trait("Case", "FRM-061")]
    public void A_raw_byte_that_is_not_UTF8_inside_a_string_is_invalid()
    {
        byte[] json = [.. Encoding.UTF8.GetBytes("""{"k":"a"""), 0xFF, .. Encoding.UTF8.GetBytes("""b"}""")];
        using var document = JsonDocument.Parse(json);

        ShouldRefuseTheDefinition(Validate("Form", document.RootElement.Clone()), "formDefinitionInvalid");
    }

    [Fact]
    [Trait("Case", "FRM-060")]
    [Trait("Case", "FRM-061")]
    public void A_definition_is_at_most_the_limit_in_bytes()
    {
        ValidateJson("Form", ObjectOfBytes(Limit)).IsValid.ShouldBeTrue();

        ShouldRefuseTheDefinition(ValidateJson("Form", ObjectOfBytes(Limit + 1)), "formDefinitionTooLarge");
    }

    [Fact]
    [Trait("Case", "FRM-060")]
    [Trait("Case", "FRM-061")]
    public void The_size_is_in_UTF8_bytes_not_characters()
    {
        var letters = new string('ب', (Limit - 8) / 2);

        ValidateJson("Form", $$"""{"k":"{{letters}}"}""").IsValid.ShouldBeTrue();

        ShouldRefuseTheDefinition(ValidateJson("Form", $$"""{"k":"{{letters}}x"}"""), "formDefinitionTooLarge");
    }

    [Fact]
    [Trait("Case", "FRM-060")]
    [Trait("Case", "FRM-061")]
    public void Inner_whitespace_counts_as_written()
    {
        ValidateJson("Form", $$"""{"k":"a"{{new string(' ', Limit - 9)}}}""").IsValid.ShouldBeTrue();

        ShouldRefuseTheDefinition(ValidateJson("Form", $$"""{"k":"a"{{new string(' ', Limit - 8)}}}"""), "formDefinitionTooLarge");
    }

    [Fact]
    [Trait("Case", "FRM-060")]
    [Trait("Case", "FRM-061")]
    public void Each_escape_counts_as_its_six_characters_written()
    {
        const int escapes = 174_761;
        var escaped = string.Concat(Enumerable.Repeat(@"\u0041", escapes));
        var padding = new string('x', Limit - 8 - (escapes * 6));

        ValidateJson("Form", $$"""{"k":"{{escaped}}{{padding}}"}""").IsValid.ShouldBeTrue();

        ShouldRefuseTheDefinition(ValidateJson("Form", $$"""{"k":"{{escaped}}{{padding}}x"}"""), "formDefinitionTooLarge");
    }

    [Fact]
    [Trait("Case", "FRM-060")]
    [Trait("Case", "FRM-061")]
    public void Errors_of_the_name_and_the_definition_come_together_the_names_first()
    {
        var answer = ValidateJson("   ", "5");

        answer.Status.ShouldBe(400);
        answer.Code.ShouldBe("nameRequired");
        answer.Errors.ShouldBe([new ApiFieldError("nameRequired", "name"), new ApiFieldError("formDefinitionInvalid", "definition")]);
    }
}
