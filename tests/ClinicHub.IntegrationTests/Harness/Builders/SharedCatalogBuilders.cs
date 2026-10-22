using System.Runtime.CompilerServices;
using ClinicHub.Application.Features.Catalog.Categories;
using ClinicHub.Application.Features.Platform.DrugCategories.Commands.CreateCategory;
using ClinicHub.Application.Features.Platform.DrugCategories.Commands.CreateSubCategory;
using ClinicHub.Application.Features.Platform.SharedDrugs;
using ClinicHub.Application.Features.Platform.SharedDrugs.Commands.CreateSharedDrug;
using ClinicHub.Application.Features.Platform.SharedDrugs.Commands.WithdrawSharedDrug;
using ClinicHub.Application.Features.Platform.SharedDrugs.Queries.GetSharedDrug;
using ClinicHub.IntegrationTests.Harness.Assertions;
using ClinicHub.IntegrationTests.Harness.Hosting;

namespace ClinicHub.IntegrationTests.Harness.Builders;

/// <summary>
/// <c>CreateSharedDrugCommand</c> as the super admin (no clinic; the handler opens <c>UseSharedCatalog()</c>): a
/// test-owned shared drug (design M1.7 D12: tests that write the shared catalog use their own rows, never imported
/// ones). Default: a unique name, no ingredients, no description, «العيون › المياه الزرقاء», active.
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

    public async Task<AdminDrugDto> CreateAsync()
    {
        var drug = (await app.SendAsync(new CreateSharedDrugCommand(name, activeIngredients, description, categoryId, subCategoryId)))
            .ShouldSucceed();
        if (!withdrawn)
            return drug;
        (await app.SendAsync(new WithdrawSharedDrugCommand(drug.Id))).ShouldSucceed();
        return (await app.SendAsync(new GetSharedDrugQuery(drug.Id))).ShouldSucceed();
    }

    public TaskAwaiter<AdminDrugDto> GetAwaiter() => CreateAsync().GetAwaiter();
}

/// <summary>
/// <c>CreateCategoryCommand</c> as the super admin: a test-owned category (default: unique English and Arabic names).
/// </summary>
public sealed class CategoryBuilder(AppFixture app)
{
    private string nameEn = Unique.Name("Test category", "x");
    private string nameAr = Unique.Name("تصنيف تجريبي", "ت");

    public CategoryBuilder Named(string english, string arabic) { nameEn = english; nameAr = arabic; return this; }

    public async Task<CategoryDto> CreateAsync() =>
        (await app.SendAsync(new CreateCategoryCommand(nameEn, nameAr))).ShouldSucceed();

    public TaskAwaiter<CategoryDto> GetAwaiter() => CreateAsync().GetAwaiter();
}

/// <summary>
/// <c>CreateSubCategoryCommand</c> as the super admin: a test-owned subcategory of <paramref name="categoryId"/> (an
/// imported category may hold it: creating a subcategory never touches the category row, D5).
/// </summary>
public sealed class SubCategoryBuilder(AppFixture app, int categoryId)
{
    private string nameEn = Unique.Name("Test subcategory", "x");
    private string nameAr = Unique.Name("تصنيف فرعي تجريبي", "ت");

    public SubCategoryBuilder Named(string english, string arabic) { nameEn = english; nameAr = arabic; return this; }

    public async Task<SubCategoryDto> CreateAsync() =>
        (await app.SendAsync(new CreateSubCategoryCommand(categoryId, nameEn, nameAr))).ShouldSucceed();

    public TaskAwaiter<SubCategoryDto> GetAwaiter() => CreateAsync().GetAwaiter();
}
