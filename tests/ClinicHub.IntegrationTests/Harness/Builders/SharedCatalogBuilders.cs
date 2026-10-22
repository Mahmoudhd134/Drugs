using System.Runtime.CompilerServices;
using ClinicHub.Application.Features.Catalog.Categories;
using ClinicHub.Application.Features.Platform.SharedDrugs;
using ClinicHub.IntegrationTests.Harness.Hosting;

namespace ClinicHub.IntegrationTests.Harness.Builders;

/// <summary>
/// <c>CreateSharedDrugCommand</c> as the super admin (no clinic; the handler opens <c>UseSharedCatalog()</c>): a
/// test-owned shared drug (design M1.7 D12: tests that write the shared catalog use their own rows, never imported
/// ones). Default: a unique name, no ingredients, no description, «العيون › المياه الزرقاء», active.
/// M1.7b contract stub (track <c>harness</c>).
/// </summary>
public sealed class SharedDrugBuilder(AppFixture app)
{
    private string name = Unique.Name("Shared drug", "دواء مشترك");
    private string activeIngredients;
    private string description;
    private int categoryId = CategoryIds.Eye;
    private int? subCategoryId = SubCategoryIds.Glaucoma;
    private bool withdrawn;

    public SharedDrugBuilder Named(string value) { name = value; return this; }
    public SharedDrugBuilder WithIngredients(string value) { activeIngredients = value; return this; }
    public SharedDrugBuilder Described(string value) { description = value; return this; }

    /// <summary>Another category; <paramref name="subCategoryId"/> null = «بدون تصنيف فرعي».</summary>
    public SharedDrugBuilder InCategory(int category, int? subCategory = null)
    {
        categoryId = category;
        subCategoryId = subCategory;
        return this;
    }

    /// <summary>Withdrawn right after it is created (<c>WithdrawSharedDrugCommand</c>).</summary>
    public SharedDrugBuilder Withdrawn() { withdrawn = true; return this; }

    public Task<AdminDrugDto> CreateAsync() =>
        throw new NotImplementedException(
            $"M1.7b contract stub: track harness ({app.GetType().Name}, {name}, {activeIngredients}, {description}, {categoryId}, {subCategoryId}, {withdrawn})");

    public TaskAwaiter<AdminDrugDto> GetAwaiter() => CreateAsync().GetAwaiter();
}

/// <summary>
/// <c>CreateCategoryCommand</c> as the super admin: a test-owned category (default: unique English and Arabic names).
/// M1.7b contract stub (track <c>harness</c>).
/// </summary>
public sealed class CategoryBuilder(AppFixture app)
{
    private string nameEn = Unique.Name("Test category", "x");
    private string nameAr = Unique.Name("تصنيف تجريبي", "ت");

    public CategoryBuilder Named(string english, string arabic) { nameEn = english; nameAr = arabic; return this; }

    public Task<CategoryDto> CreateAsync() =>
        throw new NotImplementedException($"M1.7b contract stub: track harness ({app.GetType().Name}, {nameEn}, {nameAr})");

    public TaskAwaiter<CategoryDto> GetAwaiter() => CreateAsync().GetAwaiter();
}

/// <summary>
/// <c>CreateSubCategoryCommand</c> as the super admin: a test-owned subcategory of <paramref name="categoryId"/> (an
/// imported category may hold it: creating a subcategory never touches the category row, D5).
/// M1.7b contract stub (track <c>harness</c>).
/// </summary>
public sealed class SubCategoryBuilder(AppFixture app, int categoryId)
{
    private string nameEn = Unique.Name("Test subcategory", "x");
    private string nameAr = Unique.Name("تصنيف فرعي تجريبي", "ت");

    public SubCategoryBuilder Named(string english, string arabic) { nameEn = english; nameAr = arabic; return this; }

    public Task<SubCategoryDto> CreateAsync() =>
        throw new NotImplementedException(
            $"M1.7b contract stub: track harness ({app.GetType().Name}, {categoryId}, {nameEn}, {nameAr})");

    public TaskAwaiter<SubCategoryDto> GetAwaiter() => CreateAsync().GetAwaiter();
}
