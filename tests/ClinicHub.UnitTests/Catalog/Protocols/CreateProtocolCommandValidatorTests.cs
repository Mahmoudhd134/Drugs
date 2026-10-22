using ClinicHub.Application.Features.Catalog.Protocols;
using ClinicHub.Application.Features.Catalog.Protocols.Commands.CreateProtocol;
using ClinicHub.Domain.Catalog;
using ClinicHub.UnitTests.TestSupport;
using Shouldly;

namespace ClinicHub.UnitTests.Catalog.Protocols;

/// <summary>
/// <c>POST /drug-groups</c> validation (drug-groups tech § Backend): name → at least one item → at most 1000 items
/// (<c>invalidRequest</c>, item rules skipped) → each item's normalized dosing ("ask" allowed). Null items ignored.
/// </summary>
[Trait("Area", "catalog")]
public class CreateProtocolCommandValidatorTests
{
    private static ApiValidationAnswer Validate(string name, List<SaveProtocolItem> items) =>
        ApiValidation.Run(new CreateProtocolCommandValidator(), new CreateProtocolCommand(name, items));

    private static SaveProtocolItem Item(int drugId, Dosing dosing = null) => new(drugId, dosing);

    private static readonly Dosing Invalid = new() { Frequency = "daily" };

    [Fact]
    public void A_group_with_a_name_and_lines_is_valid()
    {
        Validate("Post cataract", [Item(1), Item(2, new Dosing { Eye = "ask" }), Item(3, new Dosing { Eye = "left" })])
            .IsValid.ShouldBeTrue();
    }

    [Theory]
    [InlineData("", "nameRequired")]
    [InlineData(null, "nameRequired")]
    [InlineData("a\nb", "nameInvalid")]
    [InlineData("a\u202Db", "nameInvalid")]
    public void Name_errors_are_on_the_name(string name, string code)
    {
        Validate(name, [Item(1)]).Errors.ShouldBe([new ApiFieldError(code, "name")]);
    }

    [Fact]
    public void Name_is_at_most_256_characters()
    {
        Validate(Text.OfLength(256), [Item(1)]).IsValid.ShouldBeTrue();
        Validate(Text.OfLength(257), [Item(1)]).Errors.ShouldBe([new ApiFieldError("nameTooLong", "name")]);
    }

    [Fact]
    public void A_group_needs_at_least_one_drug()
    {
        Validate("G", []).Errors.ShouldBe([new ApiFieldError("drugsRequired", "items")]);
        Validate("G", null).Errors.ShouldBe([new ApiFieldError("drugsRequired", "items")]);
        Validate("G", [null, null]).Errors.ShouldBe([new ApiFieldError("drugsRequired", "items")]);
    }

    [Fact]
    public void Null_items_are_ignored()
    {
        Validate("G", [null, Item(1), null]).IsValid.ShouldBeTrue();
    }

    [Fact]
    public void A_group_holds_at_most_1000_lines()
    {
        var thousand = Enumerable.Range(1, 1000).Select(id => Item(id)).ToList();
        Validate("G", thousand).IsValid.ShouldBeTrue();

        var tooMany = Enumerable.Range(1, 1001).Select(id => Item(id, Invalid)).ToList();
        var answer = Validate("G", tooMany);
        answer.Errors.ShouldBe([new ApiFieldError("invalidRequest", "items")], "no per-item errors beyond the cap");
        answer.Status.ShouldBe(400);
        SaveProtocolItem.MaxItems.ShouldBe(1000);
    }

    [Fact]
    public void An_invalid_override_is_reported_on_its_line()
    {
        Validate("G", [Item(1), Item(2, Invalid), Item(3, new Dosing { DoseAmount = 0, DoseUnit = "drop" })])
            .Errors.ShouldBe([
                new ApiFieldError("invalidDosing", "items[1].dosing"),
                new ApiFieldError("invalidDosing", "items[2].dosing"),
            ]);
    }

    [Fact]
    public void Ask_eye_is_allowed_on_a_line()
    {
        Validate("G", [Item(1, new Dosing { Eye = "ask", Frequency = "daily", FrequencyValue = 2 })]).IsValid.ShouldBeTrue();
    }

    [Fact]
    public void Duplicate_lines_are_left_to_the_handler()
    {
        // duplicateProtocolItem needs the drugs' default eyes: the handler checks it after validation
        Validate("", [Item(1, new Dosing { Eye = "right" }), Item(1, new Dosing { Eye = "right" })])
            .Errors.ShouldBe([new ApiFieldError("nameRequired", "name")]);
    }

    [Fact]
    public void All_errors_are_reported_in_order()
    {
        Validate("", []).Errors.ShouldBe([
            new ApiFieldError("nameRequired", "name"),
            new ApiFieldError("drugsRequired", "items"),
        ]);
        Validate(" ", [Item(1, Invalid)]).Errors.ShouldBe([
            new ApiFieldError("nameRequired", "name"),
            new ApiFieldError("invalidDosing", "items[0].dosing"),
        ]);
    }
}
