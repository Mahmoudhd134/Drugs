using ClinicHub.Application.Features.Catalog.DrugGroups;
using ClinicHub.Domain.Catalog;
using Shouldly;

namespace ClinicHub.UnitTests.Catalog.DrugGroups;

/// <summary>
/// Saved group lines (drug-groups tech § Backend): null lines dropped, overrides normalized, and one line per drug per
/// <b>effective</b> eye (the override eye, else the drug's default eye; no eye = "none"; "ask" is its own value).
/// </summary>
[Trait("Area", "catalog")]
public class SaveDrugGroupItemTests
{
    private static SaveDrugGroupItem Item(int drugId, string eye = null) =>
        new(drugId, eye is null ? null : new Dosing { Eye = eye });

    private static readonly Dictionary<int, string> NoDefaultEyes = [];

    [Fact]
    public void Normalize_keeps_the_order_drops_null_lines_and_normalizes_overrides()
    {
        var items = SaveDrugGroupItem.Normalize([
            new SaveDrugGroupItem(3, new Dosing { Frequency = "bedtime", FrequencyValue = 2 }),
            null,
            new SaveDrugGroupItem(1, new Dosing()),
            new SaveDrugGroupItem(2, null),
        ]);

        items.Select(i => i.DrugId).ShouldBe([3, 1, 2]);
        items[0].Dosing.Frequency.ShouldBe("bedtime");
        items[0].Dosing.FrequencyValue.ShouldBeNull();
        items[1].Dosing.ShouldBeNull("an empty override is no override");
        items[2].Dosing.ShouldBeNull();
    }

    [Fact]
    public void Normalize_of_no_list_is_empty()
    {
        SaveDrugGroupItem.Normalize(null).ShouldBeEmpty();
    }

    [Fact]
    public void Same_drug_with_the_same_override_eye_is_a_duplicate()
    {
        SaveDrugGroupItem.HasDuplicate([Item(1, "right"), Item(1, "right")], NoDefaultEyes).ShouldBeTrue();
    }

    [Fact]
    public void Same_drug_for_each_eye_is_fine()
    {
        SaveDrugGroupItem.HasDuplicate([Item(1, "right"), Item(1, "left")], NoDefaultEyes).ShouldBeFalse();
    }

    [Fact]
    public void Two_lines_without_an_eye_are_a_duplicate()
    {
        SaveDrugGroupItem.HasDuplicate([Item(1), Item(1)], NoDefaultEyes).ShouldBeTrue();
    }

    [Fact]
    public void Ask_is_an_eye_of_its_own()
    {
        SaveDrugGroupItem.HasDuplicate([Item(1, "ask"), Item(1, "ask")], NoDefaultEyes).ShouldBeTrue();
        SaveDrugGroupItem.HasDuplicate([Item(1, "ask"), Item(1, "right")], NoDefaultEyes).ShouldBeFalse();
        SaveDrugGroupItem.HasDuplicate([Item(1, "ask"), Item(1)], NoDefaultEyes).ShouldBeFalse();
    }

    [Fact]
    public void The_drug_default_eye_counts_for_a_line_without_one()
    {
        var defaults = new Dictionary<int, string> { [1] = "right" };

        SaveDrugGroupItem.HasDuplicate([Item(1), Item(1, "right")], defaults).ShouldBeTrue("effective eye right twice");
        SaveDrugGroupItem.HasDuplicate([Item(1), Item(1, "left")], defaults).ShouldBeFalse();
    }

    [Fact]
    public void No_eye_and_none_are_the_same()
    {
        SaveDrugGroupItem.HasDuplicate([Item(1), Item(1, "none")], NoDefaultEyes).ShouldBeTrue();
        SaveDrugGroupItem.HasDuplicate([Item(1), Item(1, "none")], new Dictionary<int, string> { [1] = null })
            .ShouldBeTrue();
    }

    [Fact]
    public void A_default_eye_change_can_make_lines_clash()
    {
        // Line A without override (drug default), line B overriding "left": fine while the default is "right",
        // a duplicate once the default becomes "left"
        List<SaveDrugGroupItem> lines = [Item(1), Item(1, "left")];

        SaveDrugGroupItem.HasDuplicate(lines, new Dictionary<int, string> { [1] = "right" }).ShouldBeFalse();
        SaveDrugGroupItem.HasDuplicate(lines, new Dictionary<int, string> { [1] = "left" }).ShouldBeTrue();
    }

    [Fact]
    public void Different_drugs_never_clash()
    {
        SaveDrugGroupItem.HasDuplicate([Item(1, "right"), Item(2, "right"), Item(3), Item(4)], NoDefaultEyes)
            .ShouldBeFalse();
    }

    [Fact]
    public void An_override_without_an_eye_uses_the_drug_default_eye()
    {
        var defaults = new Dictionary<int, string> { [1] = "both" };
        var withDose = new SaveDrugGroupItem(1, new Dosing { DoseAmount = 2, DoseUnit = "drop" });

        SaveDrugGroupItem.HasDuplicate([withDose, Item(1, "both")], defaults).ShouldBeTrue();
    }
}
