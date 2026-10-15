using ClinicHub.Application.Features.Catalog.Drugs.Commands.UpdateDrug;
using ClinicHub.Domain.Catalog;
using ClinicHub.UnitTests.TestSupport;
using Shouldly;

namespace ClinicHub.UnitTests.Catalog.Drugs;

/// <summary><c>PUT /drugs/{id}</c> validation: the same rules and order as create (drugs tech § Backend).</summary>
[Trait("Area", "catalog")]
public class UpdateDrugCommandValidatorTests
{
    private static ApiValidationAnswer Validate(string name, string description = null, Dosing dosing = null, int id = 1) =>
        ApiValidation.Run(new UpdateDrugCommandValidator(), new UpdateDrugCommand(id, name, description, dosing));

    [Fact]
    public void A_drug_with_a_name_a_description_and_a_dosing_is_valid()
    {
        Validate("Tobradex", "desc", new Dosing { DoseUnit = "tablet", DurationUnit = "days", DurationValue = 5 })
            .IsValid.ShouldBeTrue();
    }

    [Fact]
    public void An_unknown_id_is_not_a_validation_error()
    {
        // The 404 comes from the handler, after validation
        Validate("Tobradex", id: 999_999).IsValid.ShouldBeTrue();
        Validate("", id: 999_999).Errors.ShouldBe([new ApiFieldError("nameRequired", "name")]);
    }

    [Theory]
    [InlineData("   ", "nameRequired")]
    [InlineData("a\u2028b", "nameInvalid")]
    [InlineData("a\tb", "nameInvalid")]
    public void Name_errors_are_on_the_name(string name, string code)
    {
        Validate(name).Errors.ShouldBe([new ApiFieldError(code, "name")]);
    }

    [Fact]
    public void Name_is_at_most_256_characters()
    {
        Validate(Text.OfLength(256)).IsValid.ShouldBeTrue();
        Validate(Text.OfLength(257)).Errors.ShouldBe([new ApiFieldError("nameTooLong", "name")]);
    }

    [Fact]
    public void Ask_eye_is_refused_on_a_drug()
    {
        Validate("Tobradex", null, new Dosing { Eye = "ask" })
            .Errors.ShouldBe([new ApiFieldError("invalidDosing", "defaultDosing")]);
    }

    [Fact]
    public void All_errors_are_reported_in_order_name_description_dosing()
    {
        var answer = Validate(null, "\0", new Dosing { Frequency = "custom" });

        answer.Code.ShouldBe("nameRequired");
        answer.Errors.ShouldBe([
            new ApiFieldError("nameRequired", "name"),
            new ApiFieldError("invalidText", "description"),
            new ApiFieldError("invalidDosing", "defaultDosing"),
        ]);
    }
}
