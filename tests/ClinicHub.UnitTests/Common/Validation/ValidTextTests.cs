using ClinicHub.Application.Common.Validation;
using ClinicHub.UnitTests.TestSupport;
using FluentValidation;
using Shouldly;

namespace ClinicHub.UnitTests.Common.Validation;

/// <summary>Optional free text <c>ValidText</c> (drugs tech § Backend): no NUL; line breaks and tabs are fine.</summary>
[Trait("Area", "catalog")]
public class ValidTextTests
{
    public sealed record Described(string Description);

    private sealed class TextValidator : AbstractValidator<Described>
    {
        public TextValidator() => RuleFor(x => x.Description).ValidText();
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   ")]
    [InlineData("سطر1\nسطر2")]
    [InlineData("a\tb\r\nc")]
    public void Text_without_a_NUL_is_valid(string text)
    {
        ApiValidation.Run(new TextValidator(), new Described(text)).IsValid.ShouldBeTrue();
    }

    [Theory]
    [InlineData("\0")]
    [InlineData("before\0after")]
    public void Text_with_a_NUL_is_invalid(string text)
    {
        var answer = ApiValidation.Run(new TextValidator(), new Described(text));

        answer.Errors.ShouldBe([new ApiFieldError("invalidText", "description")]);
    }
}
