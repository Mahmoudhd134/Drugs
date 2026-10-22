using System.Net;
using System.Text.Json.Nodes;
using ClinicHub.Application.Features.Catalog.Categories;
using ClinicHub.Application.Features.Platform.DrugCategories;
using ClinicHub.IntegrationTests.Admin.SharedDrugs;
using ClinicHub.IntegrationTests.Harness.Assertions;
using ClinicHub.IntegrationTests.Harness.Builders;
using ClinicHub.IntegrationTests.Harness.Clients;
using ClinicHub.IntegrationTests.Harness.Databases;
using ClinicHub.IntegrationTests.Harness.Hosting;
using Microsoft.EntityFrameworkCore;
using Shouldly;
using static ClinicHub.IntegrationTests.Admin.SharedDrugs.SharedCatalogApi;
using static ClinicHub.IntegrationTests.Admin.SharedDrugs.SharedCatalogRoutes;

namespace ClinicHub.IntegrationTests.Admin.Categories;

/// <summary>
/// The super admin's categories and subcategories (design M1.7 D5, D8, § 7, § 8): create, rename, the name rules,
/// delete and the counts. Every write uses the test's own categories and subcategories (D12); a test subcategory may
/// live under an imported category (creating it never touches the category row).
/// </summary>
[Collection(DrugCategoriesCollection.Name)]
[Trait("Area", "admin")]
public class DrugCategoryAdminTests(AppFixture app) : IntegrationTest(app)
{
    private Task<ApiClient> AdminAsync() => Login.SharedSuperAdminAsync();

    [Fact]
    [Trait("Case", "CAT-190")]
    public async Task A_new_category_answers_201_and_every_clinic_lists_it_with_no_drug_in_it()
    {
        var admin = await AdminAsync();
        var a = await Data.Clinic();
        var b = await Data.Clinic();
        var n = Unique.Next();
        var (nameEn, nameAr) = ($"Test cat {n}", $"تصنيف تجريبي {n}");

        var response = await admin.PostAsync(AdminCategories, CategoryBody(nameEn, nameAr));

        await response.ShouldBeAsync(HttpStatusCode.Created);
        response.LocationPath().ShouldBe(AdminCategories);
        var created = await response.ReadAsync<CategoryDto>();
        created.Id.ShouldBeGreaterThan(TestRun.Baseline.MaxCategoryId);
        (created.NameEn, created.NameAr, created.PinnedLast).ShouldBe((nameEn, nameAr, false));
        created.SubCategories.ShouldBeEmpty();
        foreach (var clinic in new[] { a, b })
        {
            var owner = await Login.OwnerAsync(clinic);
            var listed = (await owner.ClinicCategoriesAsync()).Where(c => c.Id == created.Id).ShouldHaveSingleItem();
            (listed.NameEn, listed.NameAr, listed.PinnedLast).ShouldBe((nameEn, nameAr, false));
            listed.SubCategories.ShouldBeEmpty();
            var drugs = await owner.ClinicDrugsAsync($"categoryId={created.Id}");
            drugs.TotalCount.ShouldBe(0);
            drugs.Items.ShouldBeEmpty();
        }
        var counted = await admin.AdminCategoryAsync(created.Id);
        (counted.DrugCount, counted.NoSubCategoryDrugCount, counted.DeletedClinicsDrugCount).ShouldBe((0, 0, 0));
    }

    [Fact]
    [Trait("Case", "CAT-191")]
    public async Task A_category_name_equal_to_an_existing_one_in_another_case_or_hamza_form_is_409_on_its_field()
    {
        var admin = await AdminAsync();
        var mine = await Data.Category();
        var count = (await admin.AdminCategoriesAsync()).Count;

        (await (await admin.PostAsync(AdminCategories, CategoryBody("eye", Unique.Name("فريد", "ف"))))
            .ShouldBeProblemAsync(HttpStatusCode.Conflict, "categoryNameTaken")).ShouldHaveError("nameEn", "categoryNameTaken");
        (await (await admin.PostAsync(AdminCategories, CategoryBody("  EYE  ", Unique.Name("فريد", "ف"))))
            .ShouldBeProblemAsync(HttpStatusCode.Conflict, "categoryNameTaken")).ShouldHaveError("nameEn", "categoryNameTaken");
        (await (await admin.PostAsync(AdminCategories, CategoryBody(Unique.Name("Unique", "x"), "الامراض الجلديه")))
            .ShouldBeProblemAsync(HttpStatusCode.Conflict, "categoryNameTaken")).ShouldHaveError("nameAr", "categoryNameTaken");
        (await (await admin.PutAsync(AdminCategory(mine.Id), CategoryBody("Eye", mine.NameAr)))
            .ShouldBeProblemAsync(HttpStatusCode.Conflict, "categoryNameTaken")).ShouldHaveError("nameEn", "categoryNameTaken");

        (await admin.AdminCategoriesAsync()).Count.ShouldBe(count);
        (await admin.AdminCategoryAsync(mine.Id)).NameEn.ShouldBe(mine.NameEn);
    }

    [Fact]
    [Trait("Case", "CAT-192")]
    public async Task Renaming_a_category_or_subcategory_to_its_own_name_another_case_or_hamza_is_200()
    {
        var admin = await AdminAsync();
        var n = Unique.Next();
        var category = await Data.Category().Named($"Test cat {n}", $"أدوية تجريبية {n}");
        var sub = await Data.SubCategory(category.Id).Named($"Test sub {n}", $"أشكال تجريبية {n}");

        foreach (var (nameEn, nameAr) in new[]
                 {
                     ($"Test cat {n}", $"أدوية تجريبية {n}"), ($"test cat {n}", $"أدوية تجريبية {n}"),
                     ($"test cat {n}", $"ادوية تجريبيه {n}"),
                 })
        {
            var response = await admin.PutAsync(AdminCategory(category.Id), CategoryBody(nameEn, nameAr));
            await response.ShouldBeOkAsync();
            var renamed = await response.ReadAsync<CategoryDto>();
            (renamed.Id, renamed.NameEn, renamed.NameAr).ShouldBe((category.Id, nameEn, nameAr));
        }
        foreach (var (nameEn, nameAr) in new[]
                 {
                     ($"Test sub {n}", $"أشكال تجريبية {n}"), ($"TEST SUB {n}", $"أشكال تجريبية {n}"),
                     ($"TEST SUB {n}", $"اشكال تجريبيه {n}"),
                 })
        {
            var response = await admin.PutAsync(AdminSubCategory(sub.Id), CategoryBody(nameEn, nameAr));
            await response.ShouldBeOkAsync();
            var renamed = await response.ReadAsync<SubCategoryDto>();
            (renamed.Id, renamed.NameEn, renamed.NameAr).ShouldBe((sub.Id, nameEn, nameAr));
        }
        var stored = await admin.AdminCategoryAsync(category.Id);
        (stored.NameEn, stored.NameAr).ShouldBe(($"test cat {n}", $"ادوية تجريبيه {n}"));
        stored.SubCategories.ShouldHaveSingleItem().NameEn.ShouldBe($"TEST SUB {n}");
    }

    [Fact]
    [Trait("Case", "CAT-193")]
    public async Task Two_categories_may_each_have_Other_but_one_category_may_not_have_it_twice()
    {
        var admin = await AdminAsync();
        var first = await Data.Category();
        var second = await Data.Category();

        var inFirst = await admin.CreateSubCategoryAsync(first.Id, "Other", "أخرى");
        var inSecond = await admin.CreateSubCategoryAsync(second.Id, "Other", "أخرى");

        inSecond.Id.ShouldNotBe(inFirst.Id);
        (await (await admin.PostAsync(SubCategories(first.Id), CategoryBody("other", Unique.Name("فريد", "ف"))))
            .ShouldBeProblemAsync(HttpStatusCode.Conflict, "subCategoryNameTaken")).ShouldHaveError("nameEn", "subCategoryNameTaken");
        (await (await admin.PostAsync(SubCategories(first.Id), CategoryBody(Unique.Name("Unique", "x"), "اخرى")))
            .ShouldBeProblemAsync(HttpStatusCode.Conflict, "subCategoryNameTaken")).ShouldHaveError("nameAr", "subCategoryNameTaken");
        var renamedInto = await Data.SubCategory(first.Id);
        (await (await admin.PutAsync(AdminSubCategory(renamedInto.Id), CategoryBody("OTHER", renamedInto.NameAr)))
            .ShouldBeProblemAsync(HttpStatusCode.Conflict, "subCategoryNameTaken")).ShouldHaveError("nameEn", "subCategoryNameTaken");
        (await admin.AdminCategoryAsync(first.Id)).SubCategories.Select(s => s.Id).ShouldBe([inFirst.Id, renamedInto.Id], ignoreOrder: true);
        (await admin.AdminCategoryAsync(second.Id)).SubCategories.Select(s => s.Id).ShouldBe([inSecond.Id]);
    }

    [Theory]
    [Trait("Case", "CAT-194")]
    [InlineData("category", "nameEn", "", "nameRequired")]
    [InlineData("category", "nameEn", "LONG101", "nameTooLong")]
    [InlineData("category", "nameEn", "Bad\0name", "nameInvalid")]
    [InlineData("category", "nameEn", "Bad‮name", "nameInvalid")]
    [InlineData("category", "nameAr", "  ", "nameRequired")]
    [InlineData("category", "nameAr", "LONG101", "nameTooLong")]
    [InlineData("category", "nameAr", "اسم\0سيء", "nameInvalid")]
    [InlineData("category", "nameAr", "اسم⁦سيء", "nameInvalid")]
    [InlineData("subcategory", "nameEn", "", "nameRequired")]
    [InlineData("subcategory", "nameEn", "LONG101", "nameTooLong")]
    [InlineData("subcategory", "nameAr", "اسم\0سيء", "nameInvalid")]
    [InlineData("subcategory", "nameAr", "اسم‫سيء", "nameInvalid")]
    public async Task An_invalid_name_is_400_on_its_field(string kind, string field, string value, string code)
    {
        var admin = await AdminAsync();
        var parent = await Data.Category();
        if (value == "LONG101")
            value = TextOfLength(101);
        var nameEn = field == "nameEn" ? value : Unique.Name("Valid", "x");
        var nameAr = field == "nameAr" ? value : Unique.Name("صالح", "ص");
        var url = kind == "category" ? AdminCategories : SubCategories(parent.Id);
        var count = (await admin.AdminCategoriesAsync()).Count;

        var problem = await (await admin.PostAsync(url, CategoryBody(nameEn, nameAr))).ShouldBeProblemAsync(HttpStatusCode.BadRequest, code);

        problem.ShouldHaveError(field, code);
        (await admin.AdminCategoriesAsync()).Count.ShouldBe(count);
        (await admin.AdminCategoryAsync(parent.Id)).SubCategories.ShouldBeEmpty();
    }

    [Theory]
    [Trait("Case", "CAT-194")]
    [InlineData("category")]
    [InlineData("subcategory")]
    public async Task Names_of_100_characters_with_spaces_around_are_201_and_stored_trimmed(string kind)
    {
        var admin = await AdminAsync();
        var parent = await Data.Category();
        var nameEn = TextOfLength(100);
        var nameAr = TextOfLength(100, 'ع');
        var url = kind == "category" ? AdminCategories : SubCategories(parent.Id);

        var response = await admin.PostAsync(url, CategoryBody($"  {nameEn}  ", $" {nameAr} "));

        await response.ShouldBeAsync(HttpStatusCode.Created);
        var node = await response.ReadNodeAsync();
        node!["nameEn"]!.GetValue<string>().ShouldBe(nameEn);
        node["nameAr"]!.GetValue<string>().ShouldBe(nameAr);
    }

    [Fact]
    [Trait("Case", "CAT-195")]
    public async Task A_subcategory_used_only_by_a_deleted_clinics_drug_is_409_with_drugCount_1_and_counted_as_from_deleted_clinics()
    {
        var admin = await AdminAsync();
        var sub = await Data.SubCategory();
        var clinic = await Data.Clinic();
        await Data.Drug(clinic).InCategory(CategoryIds.Eye, sub.Id);
        await Data.DeleteClinicAsync(clinic);

        var problem = await (await admin.DeleteAsync(AdminSubCategory(sub.Id))).ShouldBeProblemAsync(HttpStatusCode.Conflict, "subCategoryInUse");

        problem.DrugCount().ShouldBe(1);
        var counted = (await admin.AdminCategoryAsync(CategoryIds.Eye)).SubCategories.Single(s => s.Id == sub.Id);
        (counted.DrugCount, counted.DeletedClinicsDrugCount).ShouldBe((1, 1));
    }

    [Fact]
    [Trait("Case", "CAT-196")]
    public async Task A_subcategory_used_only_by_a_withdrawn_shared_drug_is_409_subCategoryInUse()
    {
        var admin = await AdminAsync();
        var sub = await Data.SubCategory();
        await Data.SharedDrug().InCategory(CategoryIds.Eye, sub.Id).Withdrawn();

        var problem = await (await admin.DeleteAsync(AdminSubCategory(sub.Id))).ShouldBeProblemAsync(HttpStatusCode.Conflict, "subCategoryInUse");

        problem.DrugCount().ShouldBe(1);
        (await admin.AdminCategoryAsync(CategoryIds.Eye)).SubCategories.ShouldContain(s => s.Id == sub.Id);
    }

    [Fact]
    [Trait("Case", "CAT-197")]
    public async Task An_empty_category_is_deleted_with_its_empty_subcategories()
    {
        var admin = await AdminAsync();
        var category = await Data.Category();
        var first = await Data.SubCategory(category.Id);
        var second = await Data.SubCategory(category.Id);

        await (await admin.DeleteAsync(AdminCategory(category.Id))).ShouldBeAsync(HttpStatusCode.NoContent);

        (await admin.AdminCategoriesAsync()).ShouldNotContain(c => c.Id == category.Id);
        (await App.QueryDbAsync(db => db.SubCategories.CountAsync(s => s.Id == first.Id || s.Id == second.Id))).ShouldBe(0);
        await (await admin.DeleteAsync(AdminSubCategory(first.Id))).ShouldBeProblemAsync(HttpStatusCode.NotFound, "notFound");
    }

    [Fact]
    [Trait("Case", "CAT-198")]
    public async Task A_category_holding_one_own_drug_without_a_subcategory_is_409_categoryInUse_with_drugCount_1()
    {
        var admin = await AdminAsync();
        var category = await Data.Category();
        await Data.SubCategory(category.Id);
        var clinic = await Data.Clinic();
        await Data.Drug(clinic).InCategory(category.Id);

        var problem = await (await admin.DeleteAsync(AdminCategory(category.Id))).ShouldBeProblemAsync(HttpStatusCode.Conflict, "categoryInUse");

        problem.DrugCount().ShouldBe(1);
        var kept = await admin.AdminCategoryAsync(category.Id);
        (kept.DrugCount, kept.NoSubCategoryDrugCount).ShouldBe((1, 1));
        kept.SubCategories.ShouldHaveSingleItem();
    }

    [Fact]
    [Trait("Case", "CAT-199")]
    public async Task Renaming_a_category_renames_it_on_every_drug_in_it()
    {
        var admin = await AdminAsync();
        var category = await Data.Category();
        var sub = await Data.SubCategory(category.Id);
        var clinic = await Data.Clinic();
        var own = await Data.Drug(clinic).InCategory(category.Id, sub.Id);
        var shared = await Data.SharedDrug().InCategory(category.Id, sub.Id);
        var n = Unique.Next();

        await (await admin.PutAsync(AdminCategory(category.Id), CategoryBody($"Renamed cat {n}", $"تصنيف معدل {n}"))).ShouldBeOkAsync();
        await (await admin.PutAsync(AdminSubCategory(sub.Id), CategoryBody($"Renamed sub {n}", $"فرعي معدل {n}"))).ShouldBeOkAsync();

        var owner = await Login.OwnerAsync(clinic);
        foreach (var drug in new[] { await owner.ClinicDrugAsync(own.Id), await owner.ClinicDrugAsync(shared.Id) })
        {
            (drug.Category.Id, drug.Category.NameEn, drug.Category.NameAr).ShouldBe((category.Id, $"Renamed cat {n}", $"تصنيف معدل {n}"));
            (drug.SubCategory.Id, drug.SubCategory.NameEn, drug.SubCategory.NameAr).ShouldBe((sub.Id, $"Renamed sub {n}", $"فرعي معدل {n}"));
        }
        var admins = await admin.AdminDrugAsync(shared.Id);
        (admins.Category.NameEn, admins.SubCategory.NameEn).ShouldBe(($"Renamed cat {n}", $"Renamed sub {n}"));
    }

    [Fact]
    [Trait("Case", "CAT-200")]
    public async Task A_categoryId_in_a_subcategory_rename_is_ignored()
    {
        var admin = await AdminAsync();
        var first = await Data.Category();
        var second = await Data.Category();
        var sub = await Data.SubCategory(first.Id);
        var n = Unique.Next();

        var response = await admin.PutAsync(AdminSubCategory(sub.Id), new { nameEn = $"Moved {n}", nameAr = $"منقول {n}", categoryId = second.Id });

        await response.ShouldBeOkAsync();
        (await admin.AdminCategoryAsync(first.Id)).SubCategories.ShouldHaveSingleItem().NameEn.ShouldBe($"Moved {n}");
        (await admin.AdminCategoryAsync(second.Id)).SubCategories.ShouldBeEmpty();
        (await App.QueryDbAsync(db => db.SubCategories.Where(s => s.Id == sub.Id).Select(s => s.CategoryId).SingleAsync())).ShouldBe(first.Id);
    }

    [Fact]
    [Trait("Case", "CAT-201")]
    public async Task The_admin_counts_add_shared_withdrawn_and_every_clinics_own_drugs_and_show_no_names()
    {
        var admin = await AdminAsync();
        var category = await Data.Category();
        var sub = await Data.SubCategory(category.Id);
        var a = await Data.Clinic();
        var b = await Data.Clinic();
        var deleted = await Data.Clinic();
        var drugs = new[]
        {
            (await Data.SharedDrug().InCategory(category.Id, sub.Id)).Name,
            (await Data.SharedDrug().InCategory(category.Id, sub.Id).Withdrawn()).Name,
            (await Data.Drug(a).InCategory(category.Id, sub.Id)).Name,
            (await Data.Drug(b).InCategory(category.Id)).Name,
            (await Data.Drug(deleted).InCategory(category.Id, sub.Id)).Name,
        };
        await Data.DeleteClinicAsync(deleted);

        var response = await admin.GetAsync(AdminCategories);

        var body = await response.ShouldBeOkAsync();
        var counted = (await response.ReadAsync<List<AdminCategoryDto>>()).Single(c => c.Id == category.Id);
        (counted.DrugCount, counted.NoSubCategoryDrugCount, counted.DeletedClinicsDrugCount).ShouldBe((5, 1, 1));
        var countedSub = counted.SubCategories.ShouldHaveSingleItem();
        (countedSub.Id, countedSub.DrugCount, countedSub.DeletedClinicsDrugCount).ShouldBe((sub.Id, 4, 1));
        foreach (var name in drugs.Concat([a.Name, b.Name, deleted.Name]))
            Readable(body).ShouldNotContain(name);
        foreach (var item in JsonNode.Parse(body)!.AsArray())
        {
            item!.AsObject().Select(p => p.Key).ShouldBe(
                ["id", "nameEn", "nameAr", "pinnedLast", "drugCount", "deletedClinicsDrugCount", "noSubCategoryDrugCount", "subCategories"],
                ignoreOrder: true);
            foreach (var child in item["subCategories"]!.AsArray())
                child!.AsObject().Select(p => p.Key).ShouldBe(
                    ["id", "nameEn", "nameAr", "pinnedLast", "drugCount", "deletedClinicsDrugCount"], ignoreOrder: true);
        }
    }

    [Fact]
    [Trait("Case", "CAT-202")]
    public async Task Deleting_the_same_empty_category_twice_is_204_then_404()
    {
        var admin = await AdminAsync();
        var category = await Data.Category();

        await (await admin.DeleteAsync(AdminCategory(category.Id))).ShouldBeAsync(HttpStatusCode.NoContent);
        await (await admin.DeleteAsync(AdminCategory(category.Id))).ShouldBeProblemAsync(HttpStatusCode.NotFound, "notFound");
    }

    [Fact]
    [Trait("Case", "CAT-203")]
    public async Task An_unknown_category_or_subcategory_id_is_404_notFound()
    {
        var admin = await AdminAsync();
        var count = (await admin.AdminCategoriesAsync()).Count;

        foreach (var answer in new[]
                 {
                     await admin.PutAsync(AdminCategory(UnknownId), CategoryBody(Unique.Name("Ghost", "x"), Unique.Name("شبح", "ش"))),
                     await admin.DeleteAsync(AdminCategory(UnknownId)),
                     await admin.PostAsync(SubCategories(UnknownId), CategoryBody(Unique.Name("Ghost", "x"), Unique.Name("شبح", "ش"))),
                 })
            (await answer.ShouldBeProblemAsync(HttpStatusCode.NotFound, "notFound")).Errors[0].Description.ShouldBe("The category does not exist.");
        foreach (var answer in new[]
                 {
                     await admin.PutAsync(AdminSubCategory(UnknownId), CategoryBody(Unique.Name("Ghost", "x"), Unique.Name("شبح", "ش"))),
                     await admin.DeleteAsync(AdminSubCategory(UnknownId)),
                 })
            (await answer.ShouldBeProblemAsync(HttpStatusCode.NotFound, "notFound")).Errors[0].Description.ShouldBe("The subcategory does not exist.");
        (await admin.AdminCategoriesAsync()).Count.ShouldBe(count);
    }
}
