namespace ClinicHub.Application.Features.Catalog.Categories;

/// <summary>
/// The fixed ids of the imported taxonomy (design M1.7 D5): <c>load_catalog.py</c> inserts the categories 1–23 and the
/// subcategories 1–182 in <c>taxonomy.py</c>'s order, mapped by code (never by name). The two "pinned last" rows are
/// pinned by id, so a rename keeps the pin and another row named "Other" isn't pinned.
/// </summary>
public static class CategoryIds
{
    /// <summary>«أخرى» / "Other" (code <c>other</c>): always the last category.</summary>
    public const int Other = 23;

    /// <summary>«العيون» / "Eye" (code <c>eye</c>): the test builders' default category (D12).</summary>
    public const int Eye = 17;

    public static bool IsPinnedLast(int categoryId) => categoryId == Other;
}

public static class SubCategoryIds
{
    /// <summary>«غير مصنف» / "Unclassified" (code <c>other.unclassified</c>): always the last subcategory of «أخرى».</summary>
    public const int Unclassified = 182;

    /// <summary>«المياه الزرقاء» / "Glaucoma" (code <c>eye.glaucoma</c>), in <see cref="CategoryIds.Eye"/>: the builders' default.</summary>
    public const int Glaucoma = 138;

    public static bool IsPinnedLast(int subCategoryId) => subCategoryId == Unclassified;
}
