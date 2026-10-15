using ClinicHub.Application.Features.Platform.Clinics.Commands.RenameClinic;
using ClinicHub.UnitTests.TestSupport;
using Shouldly;

namespace ClinicHub.UnitTests.Platform.Clinics;

/// <summary><c>PUT /admin/clinics/{id}</c> (rename) validation: the shared name rules (platform-admin tech § API).</summary>
[Trait("Area", "admin")]
public class RenameClinicCommandValidatorTests
{
    private static ApiValidationAnswer Validate(string name) =>
        ApiValidation.Run(new RenameClinicCommandValidator(), new RenameClinicCommand(4, name));

    [Theory]
    [InlineData("  ", "nameRequired")]
    [InlineData(null, "nameRequired")]
    [InlineData("a\u202Eb", "nameInvalid")]
    [InlineData("a\u2029b", "nameInvalid")]
    public void Name_errors_are_on_the_name(string name, string code)
    {
        Validate(name).Errors.ShouldBe([new ApiFieldError(code, "name")]);
    }

    [Fact]
    public void Name_is_at_most_256_characters()
    {
        Validate(Text.OfLength(256)).IsValid.ShouldBeTrue();
        Validate("  " + Text.OfLength(256) + " ").IsValid.ShouldBeTrue();
        Validate(Text.OfLength(257)).Errors.ShouldBe([new ApiFieldError("nameTooLong", "name")]);
    }
}
