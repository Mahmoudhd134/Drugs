using ClinicHub.Application.Features.Catalog.Categories;
using Shouldly;

namespace ClinicHub.UnitTests.Catalog.Categories;

/// <summary>
/// The "pinned last" rows are pinned by id (design M1.7 D5): «أخرى» / "Other" (category 23) and «غير مصنف» /
/// "Unclassified" (subcategory 182) only, so a rename keeps the pin and another row named "Other" isn't pinned. The tree
/// and <c>/drug-categories</c> map <c>pinnedLast</c> from these two rules (M1.7c contract § 1.1).
/// </summary>
[Trait("Area", "catalog")]
public class PinnedLastTests
{
    [Fact]
    [Trait("Case", "CAT-092")]
    public void Only_category_23_Other_is_pinned_last()
    {
        CategoryIds.Other.ShouldBe(23);
        CategoryIds.IsPinnedLast(23).ShouldBeTrue();
        foreach (var id in new[] { int.MinValue, -23, 0, 1, 17, 22, 24, 182, 200, int.MaxValue })
            CategoryIds.IsPinnedLast(id).ShouldBeFalse($"category {id}");
        Enumerable.Range(1, 400).Where(CategoryIds.IsPinnedLast).ShouldBe([23]);
    }

    [Fact]
    [Trait("Case", "CAT-092")]
    public void Only_subcategory_182_Unclassified_is_pinned_last()
    {
        SubCategoryIds.Unclassified.ShouldBe(182);
        SubCategoryIds.IsPinnedLast(182).ShouldBeTrue();
        foreach (var id in new[] { int.MinValue, -182, 0, 1, 23, 138, 181, 183, int.MaxValue })
            SubCategoryIds.IsPinnedLast(id).ShouldBeFalse($"subcategory {id}");
        Enumerable.Range(1, 400).Where(SubCategoryIds.IsPinnedLast).ShouldBe([182]);
    }
}
