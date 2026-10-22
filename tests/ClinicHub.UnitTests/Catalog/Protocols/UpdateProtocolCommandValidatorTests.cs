using ClinicHub.Application.Features.Catalog.Protocols;
using ClinicHub.Application.Features.Catalog.Protocols.Commands.UpdateProtocol;
using ClinicHub.Domain.Catalog;
using ClinicHub.UnitTests.TestSupport;
using Shouldly;

namespace ClinicHub.UnitTests.Catalog.Protocols;

/// <summary><c>PUT /protocols/{id}</c> validation: the same rules and order as create (protocols tech § Backend).</summary>
[Trait("Area", "catalog")]
public class UpdateProtocolCommandValidatorTests
{
    private static ApiValidationAnswer Validate(string name, List<SaveProtocolItem> items) =>
        ApiValidation.Run(new UpdateProtocolCommandValidator(), new UpdateProtocolCommand(7, name, items));

    private static SaveProtocolItem Item(int drugId, Dosing dosing = null) => new(drugId, dosing);

    [Fact]
    public void A_protocol_with_a_name_and_lines_is_valid()
    {
        Validate("Post cataract", [Item(1, new Dosing { Eye = "ask" }), Item(1, new Dosing { Eye = "right" })])
            .IsValid.ShouldBeTrue();
    }

    [Fact]
    public void Name_rules_apply()
    {
        Validate("  ", [Item(1)]).Errors.ShouldBe([new ApiFieldError("nameRequired", "name")]);
        Validate("a\u2066b", [Item(1)]).Errors.ShouldBe([new ApiFieldError("nameInvalid", "name")]);
        Validate(Text.OfLength(256), [Item(1)]).IsValid.ShouldBeTrue();
        Validate(Text.OfLength(257), [Item(1)]).Errors.ShouldBe([new ApiFieldError("nameTooLong", "name")]);
    }

    [Fact]
    public void A_protocol_needs_at_least_one_drug()
    {
        Validate("G", []).Errors.ShouldBe([new ApiFieldError("drugsRequired", "items")]);
        Validate("G", null).Errors.ShouldBe([new ApiFieldError("drugsRequired", "items")]);
        Validate("G", [null]).Errors.ShouldBe([new ApiFieldError("drugsRequired", "items")]);
    }

    [Fact]
    public void A_protocol_holds_at_most_1000_lines()
    {
        Validate("G", Enumerable.Range(1, 1000).Select(id => Item(id)).ToList()).IsValid.ShouldBeTrue();
        Validate("G", Enumerable.Range(1, 1001).Select(id => Item(id, new Dosing { Eye = "top" })).ToList())
            .Errors.ShouldBe([new ApiFieldError("invalidRequest", "items")]);
    }

    [Fact]
    public void An_invalid_override_is_reported_on_its_line()
    {
        Validate("G", [null, Item(1), Item(2, new Dosing { Frequency = "custom", FrequencyText = " " })])
            .Errors.ShouldBe([new ApiFieldError("invalidDosing", "items[2].dosing")]);
    }

    [Fact]
    public void All_errors_are_reported_in_order()
    {
        Validate(null, [Item(1, new Dosing { DurationUnit = "weeks" })]).Errors.ShouldBe([
            new ApiFieldError("nameRequired", "name"),
            new ApiFieldError("invalidDosing", "items[0].dosing"),
        ]);
    }
}
