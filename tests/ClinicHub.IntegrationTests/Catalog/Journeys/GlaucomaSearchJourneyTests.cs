using ClinicHub.Application.Features.Catalog.Categories;
using ClinicHub.Application.Common.Paging;
using ClinicHub.Application.Features.Catalog.Drugs;
using ClinicHub.IntegrationTests.Harness.Assertions;
using ClinicHub.IntegrationTests.Harness.Builders;
using ClinicHub.IntegrationTests.Harness.Clients;
using ClinicHub.IntegrationTests.Harness.Databases;
using ClinicHub.IntegrationTests.Harness.Hosting;
using Shouldly;

namespace ClinicHub.IntegrationTests.Catalog.Journeys;

/// <summary>
/// The api level of CAT-073 (design M1.7 D7, D12): the literal 91 shared drugs of Eye › Glaucoma. The class holds this
/// test only, so it starts right after the per-class reset on the imported baseline: no other test's shared drug in
/// Eye › Glaucoma (the builder's default) can change the count (docs/testing/README.md "Data").
/// </summary>
[Collection(CatalogJourneysCollection.Name)]
[Trait("Area", "catalog")]
public class GlaucomaSearchJourneyTests(AppFixture app) : IntegrationTest(app)
{
    private const string DrugsUrl = "/api/v1/drugs";

    private static async Task<PagedResult<DrugDto>> ListAsync(ApiClient client, string query)
    {
        var response = await client.GetAsync($"{DrugsUrl}?{query}");
        await response.ShouldBeOkAsync();
        return await response.ReadAsync<PagedResult<DrugDto>>();
    }

    [Fact]
    [Trait("Case", "CAT-073")]
    public async Task Glaucoma_or_its_Arabic_name_finds_the_91_shared_drugs_of_Eye_Glaucoma_after_the_clinics_own_and_qatra_in_B_finds_nothing()
    {
        var clinic = await Data.Clinic();
        var own = await Data.Drug(clinic).Named(Unique.Name("Own drops", "خاص"));
        var owner = await Login.OwnerAsync(clinic);
        var inSubcategory = await ListAsync(owner, $"categoryId={CategoryIds.Eye}&subCategoryId={SubCategoryIds.Glaucoma}&source=shared&pageSize=100");
        inSubcategory.TotalCount.ShouldBe(91);

        foreach (var term in new[] { "glaucoma", "المياه الزرقاء" })
        {
            var shared = await ListAsync(owner, $"search={Uri.EscapeDataString(term)}&source=shared&pageSize=100");
            shared.TotalCount.ShouldBe(91, term);
            // The same drugs in the same (name) order as the subcategory itself
            shared.Items.Select(d => d.Id).ShouldBe(inSubcategory.Items.Select(d => d.Id), term);
            shared.Items.ShouldAllBe(d => d.Category.Id == CategoryIds.Eye && d.SubCategory.Id == SubCategoryIds.Glaucoma);

            // With the clinic's own drugs: its own drug of that subcategory first
            var all = await ListAsync(owner, $"search={Uri.EscapeDataString(term)}&pageSize=100");
            all.Items.First().Id.ShouldBe(own.Id, term);
            all.Items.Where(d => d.IsShared).Select(d => d.Id).ShouldBe(inSubcategory.Items.Select(d => d.Id), term);
        }

        // «قطرة» in a clinic with no own drug containing it (no shared Arabic name contains it)
        var clinicB = await Data.Clinic();
        var ownerB = await Login.OwnerAsync(clinicB);
        var ownOfB = await ListAsync(ownerB, $"search={Uri.EscapeDataString("قطرة")}&source=own");
        ownOfB.TotalCount.ShouldBe(0, "precondition: B has no own drug named «قطرة…»");
        (await ListAsync(ownerB, $"search={Uri.EscapeDataString("قطرة")}")).TotalCount.ShouldBe(0);
    }
}
