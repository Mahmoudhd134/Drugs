using System.Net;
using ClinicHub.Application.Common.Search;
using ClinicHub.Application.Features.Catalog.Categories;
using ClinicHub.IntegrationTests.Harness.Assertions;
using ClinicHub.IntegrationTests.Harness.Builders;
using ClinicHub.IntegrationTests.Harness.Clients;
using ClinicHub.IntegrationTests.Harness.Hosting;
using Shouldly;
using static ClinicHub.IntegrationTests.Admin.SharedDrugs.SharedCatalogApi;
using static ClinicHub.IntegrationTests.Admin.SharedDrugs.SharedCatalogRoutes;

namespace ClinicHub.IntegrationTests.Catalog.Tree;

/// <summary>
/// The tree after the super admin changes the shared catalog (design M1.7 D5, D6, D8, § 6): empty categories are left
/// out, withdrawn drugs are never counted, edits, moves and restores show in every clinic's tree at its next load (the
/// server caches no drug); names are platform data, counts are per clinic. Every write uses the test's own shared drugs,
/// categories and subcategories (D12); a test subcategory may live under an imported category.
/// </summary>
[Collection(CatalogTreeEditsCollection.Name)]
[Trait("Area", "catalog")]
public class DrugTreeCatalogEditsTests(AppFixture app) : TreeTest(app)
{
    private Task<ApiClient> AdminAsync() => Login.SharedSuperAdminAsync();

    /// <summary>The owners of two new clinics A and B.</summary>
    private async Task<ApiClient[]> TwoOwnersAsync() =>
        [await Login.OwnerAsync(await Data.Clinic()), await Login.OwnerAsync(await Data.Clinic())];

    [Fact]
    [Trait("Case", "CAT-084")]
    public async Task An_empty_category_and_an_empty_subcategory_are_not_in_the_tree()
    {
        var owner = await OwnerAsync();
        var category = await Data.Category();
        var subCategory = await Data.SubCategory(CategoryIds.Eye);
        var emptyInEmpty = await Data.SubCategory(category.Id);

        var tree = await TreeAsync(owner);

        tree.Categories.Select(c => c.Id).ShouldNotContain(category.Id);
        Lists(tree, CategoryIds.Eye, subCategory.Id).ShouldBeFalse("the empty test subcategory of «العيون»");
        tree.Categories.SelectMany(c => c.SubCategories).Select(s => s.Id).ShouldNotContain(emptyInEmpty.Id);
        var listed = await CategoriesAsync(owner);
        listed.Select(c => c.Id).ShouldContain(category.Id, "/drug-categories lists it (empty)");
        listed.Single(c => c.Id == CategoryIds.Eye).SubCategories.Select(s => s.Id).ShouldContain(subCategory.Id);
    }

    [Fact]
    [Trait("Case", "CAT-190")]
    public async Task A_category_created_by_the_super_admin_is_listed_for_every_clinic_and_in_no_tree()
    {
        var admin = await AdminAsync();
        var owners = await TwoOwnersAsync();
        var n = Unique.Next();

        var response = await admin.PostAsync(AdminCategories, CategoryBody($"Test cat {n}", $"تصنيف تجريبي {n}"));

        await response.ShouldBeAsync(HttpStatusCode.Created);
        var created = await response.ReadAsync<CategoryDto>();
        foreach (var owner in owners)
        {
            (await owner.ClinicCategoriesAsync()).Select(c => c.Id).ShouldContain(created.Id);
            (await TreeAsync(owner)).Categories.Select(c => c.Id).ShouldNotContain(created.Id);
            (await TreeAsync(owner, $"Test cat {n}")).Categories.ShouldBeEmpty("its name matches, but no drug is in it");
        }
    }

    [Fact]
    [Trait("Tier", "Smoke")]
    [Trait("Case", "CAT-087")]
    public async Task A_withdrawn_shared_drug_is_not_counted_and_restoring_it_counts_it_again()
    {
        var owner = await OwnerAsync();
        var subCategory = await Data.SubCategory(CategoryIds.Eye);
        var drug = await Data.SharedDrug().InCategory(CategoryIds.Eye, subCategory.Id);
        var before = await TreeAsync(owner);
        RowOf(before, CategoryIds.Eye, subCategory.Id).Count.ShouldBe(1);
        var eye = CategoryOf(before, CategoryIds.Eye).Count;

        await Data.WithdrawSharedDrugAsync(drug.Id);

        var withdrawn = await TreeAsync(owner);
        Lists(withdrawn, CategoryIds.Eye, subCategory.Id).ShouldBeFalse("its only drug is withdrawn");
        CategoryOf(withdrawn, CategoryIds.Eye).Count.ShouldBe(eye - 1);
        Total(withdrawn).ShouldBe(Total(before) - 1);
        (await TreeAsync(owner, drug.Name)).Categories.ShouldBeEmpty();

        await Data.RestoreSharedDrugAsync(drug.Id);

        var restored = await TreeAsync(owner);
        RowOf(restored, CategoryIds.Eye, subCategory.Id).Count.ShouldBe(1);
        CategoryOf(restored, CategoryIds.Eye).Count.ShouldBe(eye);
        Total(await TreeAsync(owner, drug.Name)).ShouldBe(1);
    }

    [Fact]
    [Trait("Case", "CAT-070")]
    public async Task A_withdrawn_shared_drug_is_counted_by_no_tree_search_name_arabic_name_ingredient_or_category()
    {
        var n = Unique.Next();
        var category = await Data.Category();
        var subCategory = await Data.SubCategory(category.Id);
        var ingredient = $"ZQTREEWITHDRAWOL{n}";
        var arabicName = $"زوشجرة{n}";
        var drug = await Data.SharedDrug().Named(Unique.Name("Withdrawn tree drug", "دواء معطل")).WithIngredients(ingredient)
            .InCategory(category.Id, subCategory.Id);
        await App.OutsideTheApp.ExecuteAsync("""UPDATE "Drugs" SET "NameAr" = @p0, "SearchOther" = @p1 WHERE "Id" = @p2""",
            arabicName, SearchText.OtherText(arabicName, ingredient), drug.Id);
        var owner = await OwnerAsync();
        string[] terms = [drug.Name, arabicName, ingredient.ToLowerInvariant(), category.NameEn, category.NameAr, subCategory.NameEn, subCategory.NameAr];
        foreach (var term in terms)
            RowOf(await TreeAsync(owner, term), category.Id, subCategory.Id).Count.ShouldBe(1, $"«{term}» before the withdrawal");

        await Data.WithdrawSharedDrugAsync(drug.Id);

        foreach (var term in terms)
            foreach (var source in new[] { "", "shared" })
                (await TreeAsync(owner, term, source)).Categories.ShouldBeEmpty($"«{term}», source «{source}», after the withdrawal");
        (await TreeAsync(owner)).Categories.Select(c => c.Id).ShouldNotContain(category.Id, "no search");
    }

    [Fact]
    [Trait("Tier", "Smoke")]
    [Trait("Case", "CAT-088")]
    public async Task Test_categories_are_listed_for_every_clinic_but_counted_only_in_the_tree_of_the_clinic_owning_the_drug()
    {
        var a = await Data.Clinic();
        var b = await Data.Clinic();
        var ownerA = await Login.OwnerAsync(a);
        var ownerB = await Login.OwnerAsync(b);
        var category = await Data.Category();
        var subCategory = await Data.SubCategory(CategoryIds.Eye);
        await Data.Drug(b).InCategory(category.Id);
        await Data.Drug(a).InCategory(CategoryIds.Eye, subCategory.Id);

        var treeA = await TreeAsync(ownerA);
        var treeB = await TreeAsync(ownerB);

        treeA.Categories.Select(c => c.Id).ShouldNotContain(category.Id, "B's own drug's category in A's tree");
        RowOf(treeB, category.Id, null).Count.ShouldBe(1);
        RowOf(treeA, CategoryIds.Eye, subCategory.Id).Count.ShouldBe(1);
        Lists(treeB, CategoryIds.Eye, subCategory.Id).ShouldBeFalse("A's own drug's subcategory in B's tree");
        foreach (var owner in new[] { ownerA, ownerB })
        {
            var listed = await owner.ClinicCategoriesAsync();
            listed.Select(c => c.Id).ShouldContain(category.Id);
            listed.Single(c => c.Id == CategoryIds.Eye).SubCategories.Select(s => s.Id).ShouldContain(subCategory.Id);
        }
    }

    [Fact]
    [Trait("Case", "CAT-146")]
    public async Task A_withdrawn_drug_leaves_every_clinics_tree_and_counts_at_once()
    {
        var admin = await AdminAsync();
        var subCategory = await Data.SubCategory(CategoryIds.Eye);
        var drug = await Data.SharedDrug().InCategory(CategoryIds.Eye, subCategory.Id);
        var owners = await TwoOwnersAsync();
        var eyeBefore = new List<int>();
        foreach (var owner in owners)
        {
            var tree = await TreeAsync(owner);
            RowOf(tree, CategoryIds.Eye, subCategory.Id).Count.ShouldBe(1);
            eyeBefore.Add(CategoryOf(tree, CategoryIds.Eye).Count);
        }

        await (await admin.PostAsync(Withdraw(drug.Id))).ShouldBeAsync(HttpStatusCode.NoContent);

        for (var i = 0; i < owners.Length; i++)
        {
            var tree = await TreeAsync(owners[i]);
            Lists(tree, CategoryIds.Eye, subCategory.Id).ShouldBeFalse();
            CategoryOf(tree, CategoryIds.Eye).Count.ShouldBe(eyeBefore[i] - 1);
            (await TreeAsync(owners[i], drug.Name)).Categories.ShouldBeEmpty();
            (await TreeAsync(owners[i], subCategory.NameAr)).Categories.ShouldBeEmpty();
        }
    }

    [Fact]
    [Trait("Case", "CAT-163")]
    public async Task A_restored_drug_is_back_in_every_clinics_tree_and_counts()
    {
        var admin = await AdminAsync();
        var subCategory = await Data.SubCategory(CategoryIds.Eye);
        var drug = await Data.SharedDrug().InCategory(CategoryIds.Eye, subCategory.Id).Withdrawn();
        var owners = await TwoOwnersAsync();
        var eyeBefore = new List<int>();
        foreach (var owner in owners)
        {
            var tree = await TreeAsync(owner);
            Lists(tree, CategoryIds.Eye, subCategory.Id).ShouldBeFalse();
            eyeBefore.Add(CategoryOf(tree, CategoryIds.Eye).Count);
        }

        await (await admin.PostAsync(Restore(drug.Id))).ShouldBeAsync(HttpStatusCode.NoContent);

        for (var i = 0; i < owners.Length; i++)
        {
            var tree = await TreeAsync(owners[i]);
            RowOf(tree, CategoryIds.Eye, subCategory.Id).Count.ShouldBe(1);
            CategoryOf(tree, CategoryIds.Eye).Count.ShouldBe(eyeBefore[i] + 1);
            RowOf(await TreeAsync(owners[i], drug.Name), CategoryIds.Eye, subCategory.Id).Count.ShouldBe(1);
        }
    }

    [Fact]
    [Trait("Case", "CAT-180")]
    public async Task An_edit_by_the_super_admin_shows_in_every_clinics_tree_at_its_next_load()
    {
        var admin = await AdminAsync();
        var from = await Data.SubCategory(CategoryIds.Eye);
        var category = await Data.Category();
        var to = await Data.SubCategory(category.Id);
        var n = Unique.Next();
        var drug = await Data.SharedDrug().Named($"TREEBEFORE {n} 5 ML").WithIngredients($"OLDTREEINGR{n}").InCategory(CategoryIds.Eye, from.Id);
        var owners = await TwoOwnersAsync();
        foreach (var owner in owners)
            RowOf(await TreeAsync(owner, drug.Name), CategoryIds.Eye, from.Id).Count.ShouldBe(1);
        var newName = $"TREEAFTER {n} 5 ML";

        var response = await admin.PutAsync(AdminDrug(drug.Id), SharedDrugBody(newName, $"NEWTREEINGR{n}", null, category.Id, to.Id));

        await response.ShouldBeOkAsync();
        foreach (var owner in owners)
        {
            var tree = await TreeAsync(owner);
            Lists(tree, CategoryIds.Eye, from.Id).ShouldBeFalse("the old subcategory is empty now");
            RowOf(tree, category.Id, to.Id).Count.ShouldBe(1);
            RowOf(await TreeAsync(owner, newName), category.Id, to.Id).Count.ShouldBe(1);
            RowOf(await TreeAsync(owner, $"newtreeingr{n}"), category.Id, to.Id).Count.ShouldBe(1);
            (await TreeAsync(owner, drug.Name)).Categories.ShouldBeEmpty("the old name");
            (await TreeAsync(owner, $"oldtreeingr{n}")).Categories.ShouldBeEmpty("the old ingredients");
        }
    }

    [Fact]
    [Trait("Case", "CAT-188")]
    public async Task A_shared_drug_moved_to_another_subcategory_moves_in_every_clinics_tree()
    {
        var admin = await AdminAsync();
        var from = await Data.SubCategory(CategoryIds.Eye);
        var to = await Data.SubCategory(CategoryIds.Eye);
        var drug = await Data.SharedDrug().InCategory(CategoryIds.Eye, from.Id);
        var owners = await TwoOwnersAsync();
        var eyeBefore = new List<int>();
        foreach (var owner in owners)
        {
            var tree = await TreeAsync(owner);
            RowOf(tree, CategoryIds.Eye, from.Id).Count.ShouldBe(1);
            Lists(tree, CategoryIds.Eye, to.Id).ShouldBeFalse();
            eyeBefore.Add(CategoryOf(tree, CategoryIds.Eye).Count);
        }

        await (await admin.PutAsync(AdminDrug(drug.Id), SharedDrugBody(drug.Name, subCategoryId: to.Id))).ShouldBeOkAsync();

        for (var i = 0; i < owners.Length; i++)
        {
            var tree = await TreeAsync(owners[i]);
            Lists(tree, CategoryIds.Eye, from.Id).ShouldBeFalse();
            RowOf(tree, CategoryIds.Eye, to.Id).Count.ShouldBe(1);
            CategoryOf(tree, CategoryIds.Eye).Count.ShouldBe(eyeBefore[i], "moved inside «العيون»");
        }
    }
}
