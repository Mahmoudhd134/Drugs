namespace ClinicHub.Application.Features.Catalog.Drugs;

/// <summary>
/// The <c>source</c> filter of the clinic drug lists (design M1.7 D8), bound as a string: exactly one of these
/// lower-case values; empty or absent = <see cref="All"/>; anything else (another case, digits, control characters) →
/// 400 <c>invalidRequest</c> (field <c>source</c>).
/// </summary>
public static class DrugSource
{
    public const string All = "all";
    public const string Shared = "shared";
    public const string Own = "own";

    public static readonly IReadOnlyList<string> Values = [All, Shared, Own];

    /// <summary>Null or empty, or one of <see cref="Values"/> (ordinal).</summary>
    public static bool IsValid(string source) => string.IsNullOrEmpty(source) || Values.Contains(source, StringComparer.Ordinal);
}

/// <summary>
/// The <c>subCategoryId</c> filter (design M1.7 D8), bound as a string: a positive int, or <see cref="None"/> (the
/// category's drugs without a subcategory); it requires <c>categoryId</c>. Anything else → 400 <c>invalidRequest</c>
/// (field <c>subCategoryId</c>). Ids that don't exist, or a subcategory of another category → an empty page.
/// </summary>
public static class SubCategoryFilter
{
    public const string None = "none";

    /// <summary>Null or empty (no filter), <see cref="None"/>, or a positive <c>int</c> in plain digits.</summary>
    public static bool IsValid(string subCategoryId) =>
        string.IsNullOrEmpty(subCategoryId) || subCategoryId == None
        || (subCategoryId.All(char.IsAsciiDigit) && int.TryParse(subCategoryId, out var id) && id > 0);
}
