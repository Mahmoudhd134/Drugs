using ClinicHub.IntegrationTests.Harness.Builders;
using ClinicHub.IntegrationTests.Harness.Clients;
using ClinicHub.IntegrationTests.Harness.Hosting;
using Shouldly;

namespace ClinicHub.IntegrationTests.Catalog.SharedCatalog;

/// <summary>
/// Every key of the D7 order (design M1.7 D7 "Order", § 8 "Order without a search"), the same for the drugs page list
/// and the tree buckets: own drugs first; without a search own drugs by <c>CreatedAt</c> then <c>Id</c> (both
/// descending), then shared by <c>Name</c> then <c>Id</c>; with a search, inside each part the names starting with the
/// term first, then <c>Name</c>, then <c>Id</c>. The drugs live in a test-created category and subcategory (one bucket
/// holding exactly them); the shared ones are test-created (this collection's classes may write the shared catalog).
/// The clock is frozen in a test (<see cref="TestClock"/>): creation times differ only where the test advances it or
/// dates a row by hand.
/// </summary>
[Collection(CatalogGuardsCollection.Name)]
[Trait("Area", "catalog")]
public class DrugListOrderTests(AppFixture app) : CatalogTest(app)
{
    [Fact]
    [Trait("Case", "CAT-268")]
    [Trait("Case", "DRUG-034")]
    [Trait("Case", "CAT-017")]
    public async Task Without_a_search_own_drugs_go_by_creation_time_then_id_and_shared_ones_by_name_then_id()
    {
        var (clinic, owner) = await EmptyClinicAsync();
        var category = await Data.Category();
        var subCategory = await Data.SubCategory(category.Id);
        var n = Unique.Next();

        // Own: all created at the same instant, then the first (lowest id) dated a minute later by hand: creation time
        // decides before the id (a later CreatedAt with a lower id, e.g. two saves racing)
        var datedLater = await Data.Drug(clinic).Named($"Mid own {n}").InCategory(category.Id, subCategory.Id);
        var olderId = await Data.Drug(clinic).Named($"Alpha own {n}").InCategory(category.Id, subCategory.Id);
        var newerId = await Data.Drug(clinic).Named($"Zeta own {n}").InCategory(category.Id, subCategory.Id);
        (await App.OutsideTheApp.ExecuteAsync(
            """UPDATE "Drugs" SET "CreatedAt" = "CreatedAt" + interval '1 minute' WHERE "Id" = @p0""", datedLater.Id)).ShouldBe(1);

        // Shared: created in an order that is neither the name order nor its reverse, a minute apart; two share a name
        var sharedC = await Data.SharedDrug().Named($"Cc shared {n}").InCategory(category.Id, subCategory.Id);
        Clock.Advance(TimeSpan.FromMinutes(1));
        var sharedA1 = await Data.SharedDrug().Named($"Aa shared {n}").InCategory(category.Id, subCategory.Id);
        Clock.Advance(TimeSpan.FromMinutes(1));
        var sharedB = await Data.SharedDrug().Named($"Bb shared {n}").InCategory(category.Id, subCategory.Id);
        var sharedA2 = await Data.SharedDrug().Named($"Aa shared {n}").InCategory(category.Id, subCategory.Id);

        int[] expected = [datedLater.Id, newerId.Id, olderId.Id, sharedA1.Id, sharedA2.Id, sharedB.Id, sharedC.Id];
        var bucket = $"categoryId={category.Id}&subCategoryId={subCategory.Id}";

        (await PagedIdsAsync(owner, bucket, pageSize: 100)).ShouldBe(expected, "the bucket, one page");
        (await PagedIdsAsync(owner, bucket, pageSize: 3)).ShouldBe(expected, "the bucket, pages of 3");
        (await ListDrugsAsync(owner, $"source=own&{bucket}")).Items.Select(d => d.Id).ShouldBe(expected.Take(3), "own only");
        (await ListDrugsAsync(owner, $"source=shared&{bucket}")).Items.Select(d => d.Id).ShouldBe(expected.Skip(3), "shared only");
        // The drugs page list: the clinic's own drugs come first in the whole catalog
        (await ListDrugsAsync(owner, "pageSize=3")).Items.Select(d => d.Id).ShouldBe(expected.Take(3), "the list's first page");
    }

    [Fact]
    [Trait("Case", "CAT-269")]
    [Trait("Case", "DRUG-040")]
    [Trait("Case", "CAT-017")]
    public async Task With_a_search_each_part_lists_the_names_starting_with_the_term_first_then_by_name_then_id()
    {
        var (clinic, owner) = await EmptyClinicAsync();
        var category = await Data.Category();
        var subCategory = await Data.SubCategory(category.Id);
        var term = $"qzord{Unique.Next()}x";

        // Created contains-first, so creation order never gives the expected order; two of each part share a name
        var ownZz = await Data.Drug(clinic).Named($"Zz own {term}").InCategory(category.Id, subCategory.Id);
        var ownAa = await Data.Drug(clinic).Named($"Aa own {term}").InCategory(category.Id, subCategory.Id);
        var ownStarts1 = await Data.Drug(clinic).Named($"{term} own drops").InCategory(category.Id, subCategory.Id);
        var ownStarts2 = await Data.Drug(clinic).Named($"{term} own drops").InCategory(category.Id, subCategory.Id);
        var sharedZz = await Data.SharedDrug().Named($"Zz shared {term}").InCategory(category.Id, subCategory.Id);
        var sharedAa = await Data.SharedDrug().Named($"Aa shared {term}").InCategory(category.Id, subCategory.Id);
        var sharedStarts1 = await Data.SharedDrug().Named($"{term} shared drops").InCategory(category.Id, subCategory.Id);
        var sharedStarts2 = await Data.SharedDrug().Named($"{term} shared drops").InCategory(category.Id, subCategory.Id);

        int[] expected =
        [
            ownStarts1.Id, ownStarts2.Id, ownAa.Id, ownZz.Id,
            sharedStarts1.Id, sharedStarts2.Id, sharedAa.Id, sharedZz.Id,
        ];
        var search = $"search={Uri.EscapeDataString(term)}";
        var bucket = $"categoryId={category.Id}&subCategoryId={subCategory.Id}&{search}";

        (await PagedIdsAsync(owner, search, pageSize: 100)).ShouldBe(expected, "the drugs page list");
        (await PagedIdsAsync(owner, bucket, pageSize: 100)).ShouldBe(expected, "the bucket, one page");
        (await PagedIdsAsync(owner, bucket, pageSize: 3)).ShouldBe(expected, "the bucket, pages of 3");

        // The imported catalog: of the 34 shared matches of "tobra", the 9 names starting with it come first, each
        // group by name (database collation)
        var tobra = await SearchDrugNamesAsync(owner, "tobra");
        tobra.Count.ShouldBe(34);
        var starting = tobra.Take(9).ToList();
        var others = tobra.Skip(9).ToList();
        starting.ShouldAllBe(name => name.StartsWith("TOBRA", StringComparison.OrdinalIgnoreCase));
        others.ShouldAllBe(name => !name.StartsWith("TOBRA", StringComparison.OrdinalIgnoreCase));
        starting.ShouldBe(await InDatabaseCollationAsync(starting));
        others.ShouldBe(await InDatabaseCollationAsync(others));
    }

    /// <summary>The ids of every page of GET /drugs?{query} with this page size, in the answered order.</summary>
    private static async Task<int[]> PagedIdsAsync(ApiClient client, string query, int pageSize)
    {
        var ids = new List<int>();
        for (var page = 1; ; page++)
        {
            var result = await ListDrugsAsync(client, $"{query}&pageSize={pageSize}&page={page}");
            ids.AddRange(result.Items.Select(d => d.Id));
            if (result.Items.Count < pageSize || ids.Count >= result.TotalCount)
                return [.. ids];
        }
    }
}
