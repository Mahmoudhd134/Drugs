using ClinicHub.Application.Common.Results;

namespace ClinicHub.Application.Features.Catalog.Categories;

/// <summary>
/// Category errors (design M1.7 § 7), shared by the clinic drug use cases and the admin ones. Name rules:
/// <see cref="CommonErrors.NameRequired"/>, <see cref="CommonErrors.NameInvalid"/>, <see cref="CommonErrors.NameTooLong"/>
/// (fields <c>nameEn</c> / <c>nameAr</c>).
/// </summary>
public static class CategoryErrors
{
    /// <summary>A drug saved without <c>categoryId</c> (validator, last rule).</summary>
    public static readonly Error CategoryRequired =
        new("categoryRequired", "The category is required.", ErrorType.Validation, "CategoryId");

    /// <summary>A drug's <c>categoryId</c> that doesn't exist (handler, first check).</summary>
    public static readonly Error CategoryNotFound =
        new("categoryNotFound", "The category does not exist.", ErrorType.Validation, "CategoryId");

    /// <summary>A drug's <c>subCategoryId</c> that doesn't exist or isn't in its category (handler, after the category).</summary>
    public static readonly Error SubCategoryNotFound =
        new("subCategoryNotFound", "The subcategory does not exist in this category.", ErrorType.Validation, "SubCategoryId");

    /// <summary>Admin routes: an unknown category id (404).</summary>
    public static readonly Error NotFound =
        new(CommonErrors.NotFound.Code, "The category does not exist.", ErrorType.NotFound);

    /// <summary>Admin routes: an unknown subcategory id (404).</summary>
    public static readonly Error SubCategoryMissing =
        new(CommonErrors.NotFound.Code, "The subcategory does not exist.", ErrorType.NotFound);

    /// <summary>409; set the field with <c>NameTaken with { Field = "NameEn" }</c> (or <c>"NameAr"</c>).</summary>
    public static readonly Error NameTaken =
        new("categoryNameTaken", "A category with this name already exists.", ErrorType.Conflict);

    /// <summary>409 within the same category; field as <see cref="NameTaken"/>.</summary>
    public static readonly Error SubCategoryNameTaken =
        new("subCategoryNameTaken", "A subcategory with this name already exists in this category.", ErrorType.Conflict);

    /// <summary>409, sent as a <see cref="CountError"/> (<c>drugCount</c>).</summary>
    public static readonly Error InUse =
        new("categoryInUse", "The category is used by drugs.", ErrorType.Conflict);

    /// <summary>409, sent as a <see cref="CountError"/> (<c>drugCount</c>).</summary>
    public static readonly Error SubCategoryInUse =
        new("subCategoryInUse", "The subcategory is used by drugs.", ErrorType.Conflict);
}
