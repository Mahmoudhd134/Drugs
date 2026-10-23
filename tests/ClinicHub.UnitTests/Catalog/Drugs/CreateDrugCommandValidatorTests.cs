using ClinicHub.Application.Features.Catalog.Categories;
using ClinicHub.Application.Features.Catalog.Drugs.Commands.CreateDrug;
using ClinicHub.Domain.Catalog;
using ClinicHub.UnitTests.TestSupport;
using Shouldly;

namespace ClinicHub.UnitTests.Catalog.Drugs;

/// <summary>
/// <c>POST /drugs</c> validation (drugs tech § Backend, tech overview § Errors): name, description, then the
/// normalized default dosing (the "ask" eye refused), in that order.
/// </summary>
[Trait("Area", "catalog")]
public class CreateDrugCommandValidatorTests
{
    private static ApiValidationAnswer Validate(string name, string description = null, Dosing dosing = null) =>
        ApiValidation.Run(new CreateDrugCommandValidator(), new CreateDrugCommand(name, null, description, dosing, CategoryIds.Eye, null));

    [Fact]
    public void A_drug_with_a_name_a_description_and_a_dosing_is_valid()
    {
        Validate("Tobradex", "سطر1\nسطر2",
                new Dosing { DoseAmount = 1, DoseUnit = "drop", Eye = "right", Frequency = "daily", FrequencyValue = 4 })
            .IsValid.ShouldBeTrue();
        Validate("Tobradex").IsValid.ShouldBeTrue("description and dosing are optional");
    }

    [Theory]
    [InlineData(null, "nameRequired")]
    [InlineData("", "nameRequired")]
    [InlineData("   ", "nameRequired")]
    [InlineData(Text.ZeroWidthSpace, "nameRequired")]
    [InlineData("a\0b", "nameInvalid")]
    [InlineData("a\nb", "nameInvalid")]
    [InlineData("a\u202Eb", "nameInvalid")]
    public void Name_errors_are_on_the_name(string name, string code)
    {
        var answer = Validate(name);

        answer.Status.ShouldBe(400);
        answer.Code.ShouldBe(code);
        answer.Errors.ShouldBe([new ApiFieldError(code, "name")]);
    }

    [Fact]
    public void Name_is_at_most_256_characters()
    {
        Validate(Text.OfLength(256)).IsValid.ShouldBeTrue();
        Validate(Text.OfLength(257)).Errors.ShouldBe([new ApiFieldError("nameTooLong", "name")]);
    }

    [Fact]
    public void Description_with_a_NUL_is_invalid_text()
    {
        Validate("Tobradex", "a\0b").Errors.ShouldBe([new ApiFieldError("invalidText", "description")]);
    }

    [Fact]
    public void Invalid_dosing_is_reported_on_default_dosing()
    {
        Validate("Tobradex", null, new Dosing { Frequency = "daily" })
            .Errors.ShouldBe([new ApiFieldError("invalidDosing", "defaultDosing")]);
    }

    [Fact]
    public void Ask_eye_is_refused_on_a_drug()
    {
        Validate("Tobradex", null, new Dosing { Eye = "ask" })
            .Errors.ShouldBe([new ApiFieldError("invalidDosing", "defaultDosing")]);
    }

    [Fact]
    public void The_dosing_is_validated_once_normalized()
    {
        // A number for "as needed" doesn't apply and is dropped, so it is no error
        Validate("Tobradex", null, new Dosing { Frequency = "asNeeded", FrequencyValue = 99 }).IsValid.ShouldBeTrue();
    }

    [Fact]
    public void All_errors_are_reported_in_order_name_description_dosing()
    {
        var answer = Validate("", "a\0b", new Dosing { DoseAmount = 2 });

        answer.Code.ShouldBe("nameRequired");
        answer.Errors.ShouldBe([
            new ApiFieldError("nameRequired", "name"),
            new ApiFieldError("invalidText", "description"),
            new ApiFieldError("invalidDosing", "defaultDosing"),
        ]);
    }
}
