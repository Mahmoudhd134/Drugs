using ClinicHub.Application.Common.Search;
using ClinicHub.Application.Features.Platform.Clinics.Commands.RenameClinic;
using ClinicHub.IntegrationTests.Admin;
using ClinicHub.IntegrationTests.Harness.Assertions;
using ClinicHub.IntegrationTests.Harness.Builders;
using ClinicHub.IntegrationTests.Harness.Hosting;
using Microsoft.EntityFrameworkCore;
using Shouldly;

namespace ClinicHub.IntegrationTests.Catalog.SharedCatalog;

/// <summary>
/// The search columns filled by the app (design M1.7 D7): <c>SearchName</c> = <c>SearchText.Fold(name)</c> and
/// <c>SearchOther</c> = <c>SearchText.OtherText(nameAr, activeIngredients)</c>, set by the save interceptor whenever a
/// source text changes, on every write path; a row written by raw SQL gets <c>''</c> (§ 6, accepted). A withdrawn shared
/// drug is found by no search (D6). The hidden Arabic name is set by raw SQL on a test-created shared drug (the only
/// writer of <c>NameAr</c> is the load script, D3, D12).
/// </summary>
[Collection(CatalogGuardsCollection.Name)]
[Trait("Area", "catalog")]
public class SearchColumnTests(AppFixture app) : CatalogTest(app)
{
    [Fact]
    [Trait("Tier", "Smoke")]
    [Trait("Case", "CAT-070")]
    public async Task A_withdrawn_shared_drug_is_found_by_no_search_name_arabic_name_ingredient_or_category()
    {
        var n = Unique.Next();
        var category = await Data.Category();
        var subCategory = await Data.SubCategory(category.Id);
        var ingredient = $"ZQWITHDRAWOL{n}";
        var arabicName = $"زوسحب{n}";
        var shared = await Data.SharedDrug().Named(Unique.Name("Withdrawn drug", "دواء معطل")).WithIngredients(ingredient)
            .InCategory(category.Id, subCategory.Id);
        await SetHiddenArabicNameAsync(shared.Id, arabicName, ingredient);
        var owner = await OwnerAsync();
        string[] terms = [shared.Name, arabicName, ingredient.ToLowerInvariant(), category.NameEn, category.NameAr, subCategory.NameEn, subCategory.NameAr];
        foreach (var term in terms)
            (await FoundIdsAsync(term)).ShouldContain(shared.Id, $"«{term}» before the withdrawal");

        await Data.WithdrawSharedDrugAsync(shared.Id);

        foreach (var term in terms)
        {
            (await FoundIdsAsync(term)).ShouldNotContain(shared.Id, $"«{term}» after the withdrawal");
            (await ListDrugsAsync(owner, $"source=shared&search={Uri.EscapeDataString(term)}")).TotalCount.ShouldBe(0, term);
        }
        (await ListDrugsAsync(owner, $"categoryId={category.Id}")).TotalCount.ShouldBe(0, "its category");

        async Task<List<int>> FoundIdsAsync(string term) =>
            (await ListDrugsAsync(owner, $"search={Uri.EscapeDataString(term)}&pageSize=100")).Items.Select(d => d.Id).ToList();
    }

    [Fact]
    [Trait("Tier", "Smoke")]
    [Trait("Case", "CAT-075")]
    public async Task An_own_drugs_search_columns_follow_its_name_and_ingredients_after_each_save()
    {
        var owner = await OwnerAsync();
        var n = Unique.Next();
        var oldName = $"قطرة أحمر {n}";
        var newName = $"مُضادّ حيوي {n}";
        var oldIngredients = $"OLDINGRÉ{n}+TIMOLOL";
        var newIngredients = $"NEWINGR{n}(EYE)";

        var created = await PostOwnAsync(owner, oldName, oldIngredients);
        (await StoredSearchColumnsAsync(created.Id)).ShouldBe((SearchText.Fold(oldName), SearchText.OtherText(null, oldIngredients)));
        (await SearchOwnDrugNamesAsync(owner, $"قطره احمر {n}")).ShouldBe([oldName]);

        await (await owner.PutAsync($"{DrugsUrl}/{created.Id}", DrugBody(newName, activeIngredients: oldIngredients))).ShouldBeOkAsync();
        (await StoredSearchColumnsAsync(created.Id)).ShouldBe((SearchText.Fold(newName), SearchText.OtherText(null, oldIngredients)));
        (await SearchOwnDrugNamesAsync(owner, $"قطره احمر {n}")).ShouldBeEmpty("the old name");
        (await SearchOwnDrugNamesAsync(owner, $"مضاد حيوي {n}")).ShouldBe([newName]);

        await (await owner.PutAsync($"{DrugsUrl}/{created.Id}", DrugBody(newName, activeIngredients: newIngredients))).ShouldBeOkAsync();
        var afterIngredients = await StoredSearchColumnsAsync(created.Id);
        afterIngredients.ShouldBe((SearchText.Fold(newName), SearchText.OtherText(null, newIngredients)));
        (await SearchOwnDrugNamesAsync(owner, $"oldingré{n}")).ShouldBeEmpty("the old ingredients");
        (await SearchOwnDrugNamesAsync(owner, $"newingr{n}")).ShouldBe([newName]);

        await (await owner.PutAsync($"{DrugsUrl}/{created.Id}", DrugBody(newName, "A new description", activeIngredients: newIngredients)))
            .ShouldBeOkAsync();
        (await StoredSearchColumnsAsync(created.Id)).ShouldBe(afterIngredients, "a description-only update");
    }

    [Fact]
    [Trait("Case", "CAT-076")]
    public async Task An_admin_rename_clears_the_hidden_Arabic_name_and_refolds_both_columns()
    {
        const string ingredients = "DORZOLAMIDE+TIMOLOL";
        var shared = await Data.SharedDrug().WithIngredients(ingredients);
        await SetHiddenArabicNameAsync(shared.Id, "زوكالين", ingredients);
        var newName = Unique.Name("Renamed shared drug", "مُعدّل");

        await Data.UpdateSharedDrugAsync(shared.Id, newName, ingredients);

        (await App.OutsideTheApp.ScalarAsync<string>("""SELECT "NameAr" FROM "Drugs" WHERE "Id" = @p0""", shared.Id)).ShouldBeNull();
        (await StoredSearchColumnsAsync(shared.Id)).ShouldBe((SearchText.Fold(newName), SearchText.OtherText(null, ingredients)));
    }

    [Fact]
    [Trait("Case", "CAT-078")]
    public async Task A_new_clinic_its_owner_its_copied_drugs_and_protocols_are_found_at_once_by_a_folded_search()
    {
        var n = Unique.Next();
        var templateId = await App.TemplateClinicIdAsync();
        var templateDrug = await Data.Drug(templateId).Named($"قطرة أحمر {n}");
        await Data.Protocol(templateId).Named($"بروتوكول إلتهاب {n}").With(templateDrug);
        var clinic = await Data.Clinic().Named($"عيادة الأمل {n}").OwnedBy(Unique.Phone(), $"أحمد مؤمن {n}");
        var admin = await Login.SuperAdminAsync();
        var owner = await Login.OwnerAsync(clinic);

        (await admin.SearchClinicIdsAsync($"عياده الامل {n}")).ShouldBe([clinic.Id]);
        (await admin.SearchStaffIdsAsync(clinic.Id, $"احمد مومن {n}")).ShouldBe([clinic.Owner.Id]);
        (await SearchOwnDrugNamesAsync(owner, $"قطره احمر {n}")).ShouldBe([$"قطرة أحمر {n}"]);
        (await SearchProtocolNamesAsync(owner, $"بروتوكول التهاب {n}")).ShouldBe([$"بروتوكول إلتهاب {n}"]);
    }

    [Fact]
    [Trait("Case", "CAT-080")]
    public async Task A_clinic_inserted_by_sql_gets_an_empty_search_name_and_is_found_once_the_app_saves_it()
    {
        var n = Unique.Next();
        var id = await App.OutsideTheApp.ScalarAsync<int>(
            """
            INSERT INTO "Clinics" ("Name", "Status", "IsTemplate", "CreatedAt", "UpdatedAt")
            VALUES (@p0, 'active', false, now(), now()) RETURNING "Id"
            """, $"Raw clinic {n}");
        var admin = await Login.SuperAdminAsync();

        (await App.OutsideTheApp.ScalarAsync<string>("""SELECT "SearchName" FROM "Clinics" WHERE "Id" = @p0""", id)).ShouldBe("");
        (await admin.SearchClinicIdsAsync($"raw clinic {n}")).ShouldBeEmpty("not found until the app saves it (accepted)");

        (await App.SendAsync(new RenameClinicCommand(id, $"Saved clinic {n}"))).ShouldSucceed();

        (await admin.SearchClinicIdsAsync($"saved clinic {n}")).ShouldBe([id]);
    }

    /// <summary>The hidden Arabic name, as the load script writes it (D11): <c>NameAr</c> and its <c>SearchOther</c>.</summary>
    private Task SetHiddenArabicNameAsync(int drugId, string nameAr, string ingredients) =>
        App.OutsideTheApp.ExecuteAsync("""UPDATE "Drugs" SET "NameAr" = @p0, "SearchOther" = @p1 WHERE "Id" = @p2""",
            nameAr, SearchText.OtherText(nameAr, ingredients), drugId);

    private static async Task<Application.Features.Catalog.Drugs.DrugDto> PostOwnAsync(
        Harness.Clients.ApiClient owner, string name, string ingredients)
    {
        var response = await owner.PostAsync(DrugsUrl, DrugBody(name, activeIngredients: ingredients));
        await response.ShouldBeAsync(System.Net.HttpStatusCode.Created);
        return await response.ReadAsync<Application.Features.Catalog.Drugs.DrugDto>();
    }
}
