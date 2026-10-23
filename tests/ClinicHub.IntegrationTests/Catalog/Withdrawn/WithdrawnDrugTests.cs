using System.Net;
using System.Text.Json;
using ClinicHub.Application.Features.Catalog.Categories;
using ClinicHub.Application.Features.Catalog.Protocols;
using ClinicHub.IntegrationTests.Admin.SharedDrugs;
using ClinicHub.IntegrationTests.Harness.Assertions;
using ClinicHub.IntegrationTests.Harness.Builders;
using ClinicHub.IntegrationTests.Harness.Clients;
using ClinicHub.IntegrationTests.Harness.Hosting;
using Microsoft.EntityFrameworkCore;
using Shouldly;
using static ClinicHub.IntegrationTests.Admin.SharedDrugs.SharedCatalogApi;
using static ClinicHub.IntegrationTests.Admin.SharedDrugs.SharedCatalogRoutes;

namespace ClinicHub.IntegrationTests.Catalog.Withdrawn;

/// <summary>
/// Withdrawn shared drugs (design M1.7 D6, § 7, § 8): hidden from the clinic lists and search at once, still read by id
/// and in protocols; a protocol keeps its stored lines of a withdrawn drug but can't add more; withdraw and restore are
/// idempotent. Every drug withdrawn here is the test's own shared drug (D12).
/// </summary>
[Collection(WithdrawnDrugsCollection.Name)]
[Trait("Area", "catalog")]
public class WithdrawnDrugTests(AppFixture app) : IntegrationTest(app)
{
    private Task<ApiClient> AdminAsync() => Login.SharedSuperAdminAsync();

    /// <summary>A clinic and its owner, one per test class.</summary>
    private async Task<(ClinicHandle Clinic, ApiClient Owner)> ClinicAsync()
    {
        var clinic = await App.PerClassAsync("withdrawn:clinic", () => Data.Clinic().CreateAsync());
        return (clinic, await Login.SharedAsync("withdrawn:owner", () => Login.OwnerAsync(clinic)));
    }

    private static async Task<ProtocolDto> ReadAsync(ApiClient client, int protocolId) =>
        await (await client.GetAsync(Protocol(protocolId))).ReadAsync<ProtocolDto>();

    /// <summary>The lines as the editor sends them back unchanged.</summary>
    private static object[] Unchanged(ProtocolDto protocol) => protocol.Items.Select(i => Item(i.Drug.Id, i.Dosing)).ToArray();

    private static string Lines(ProtocolDto protocol) =>
        JsonSerializer.Serialize(protocol.Items.Select(i => new { i.Drug.Id, i.Dosing }), Json.Options);

    [Fact]
    [Trait("Case", "CAT-146")]
    public async Task A_withdrawn_drug_leaves_every_clinics_list_counts_and_search_at_once()
    {
        var admin = await AdminAsync();
        var sub = await Data.SubCategory();
        var token = $"Wq{Unique.Next()}z";
        var drug = await Data.SharedDrug().Named($"WITHDRAWME {token} 5 ML").WithIngredients($"INGRED{token}")
            .InCategory(CategoryIds.Eye, sub.Id);
        var owners = new[] { await Login.OwnerAsync(await Data.Clinic()), await Login.OwnerAsync(await Data.Clinic()) };
        var before = new List<(int All, int Shared, int Eye)>();
        foreach (var owner in owners)
        {
            before.Add(((await owner.ClinicDrugsAsync("pageSize=1")).TotalCount,
                (await owner.ClinicDrugsAsync("source=shared&pageSize=1")).TotalCount,
                (await owner.ClinicDrugsAsync($"categoryId={CategoryIds.Eye}&pageSize=1")).TotalCount));
            (await owner.ClinicDrugsAsync($"categoryId={CategoryIds.Eye}&subCategoryId={sub.Id}")).Items.Select(d => d.Id).ShouldBe([drug.Id]);
            foreach (var search in new[] { drug.Name, $"ingred{token}", sub.NameEn, sub.NameAr })
                (await owner.SearchClinicDrugsAsync(search)).Items.Select(d => d.Id).ShouldBe([drug.Id], search);
        }

        await (await admin.PostAsync(Withdraw(drug.Id))).ShouldBeAsync(HttpStatusCode.NoContent);

        for (var i = 0; i < owners.Length; i++)
        {
            var owner = owners[i];
            (await owner.ClinicDrugsAsync("pageSize=1")).TotalCount.ShouldBe(before[i].All - 1);
            (await owner.ClinicDrugsAsync("source=shared&pageSize=1")).TotalCount.ShouldBe(before[i].Shared - 1);
            (await owner.ClinicDrugsAsync($"categoryId={CategoryIds.Eye}&pageSize=1")).TotalCount.ShouldBe(before[i].Eye - 1);
            var inSub = await owner.ClinicDrugsAsync($"categoryId={CategoryIds.Eye}&subCategoryId={sub.Id}");
            inSub.TotalCount.ShouldBe(0);
            inSub.Items.ShouldBeEmpty();
            foreach (var search in new[] { drug.Name, $"ingred{token}", sub.NameEn, sub.NameAr })
                (await owner.SearchClinicDrugsAsync(search)).TotalCount.ShouldBe(0, search);
        }
    }

    [Fact]
    [Trait("Case", "CAT-147")]
    public async Task A_withdrawn_drug_read_by_id_in_a_clinic_is_200_with_withdrawn_true()
    {
        var (_, owner) = await ClinicAsync();
        var drug = await Data.SharedDrug().WithIngredients("PAUSEDINGREDIENT").Withdrawn();

        var read = await owner.ClinicDrugAsync(drug.Id);

        (read.Id, read.Name, read.ActiveIngredients, read.IsShared, read.Withdrawn).ShouldBe((drug.Id, drug.Name, "PAUSEDINGREDIENT", true, true));
        read.DefaultDosing.ShouldBeNull();
        read.Category.Id.ShouldBe(CategoryIds.Eye);
    }

    [Fact]
    [Trait("Case", "CAT-148")]
    public async Task A_protocols_line_of_a_drug_withdrawn_later_is_read_with_withdrawn_true()
    {
        var (clinic, owner) = await ClinicAsync();
        var shared = await Data.SharedDrug();
        var own = await Data.Drug(clinic);
        var protocol = await Data.Protocol(clinic).With(shared.Id, Dosings.Drops(eye: "right")).With(own);

        await Data.WithdrawSharedDrugAsync(shared.Id);

        var read = await ReadAsync(owner, protocol.Id);
        read.Items.Select(i => (i.Drug.Id, i.Drug.IsShared, i.Drug.Withdrawn)).ShouldBe([(shared.Id, true, true), (own.Id, false, false)]);
        read.Items[0].Drug.Name.ShouldBe(shared.Name);
        read.Items[0].Dosing.Eye.ShouldBe("right");
    }

    [Fact]
    [Trait("Case", "CAT-149")]
    public async Task A_protocol_saved_unchanged_or_with_other_lines_edited_keeps_its_withdrawn_line()
    {
        var (clinic, owner) = await ClinicAsync();
        var shared = await Data.SharedDrug();
        var first = await Data.Drug(clinic);
        var second = await Data.Drug(clinic);
        var added = await Data.Drug(clinic);
        var protocol = await Data.Protocol(clinic).With(shared.Id).With(first).With(second);
        await Data.WithdrawSharedDrugAsync(shared.Id);
        var held = await ReadAsync(owner, protocol.Id);

        var unchanged = await owner.PutAsync(Protocol(protocol.Id), ProtocolBody(protocol.Name, Unchanged(held)));

        await unchanged.ShouldBeOkAsync();
        Lines(await ReadAsync(owner, protocol.Id)).ShouldBe(Lines(held));
        var edited = await owner.PutAsync(Protocol(protocol.Id), ProtocolBody(protocol.Name + " edited",
            Item(shared.Id), Item(first.Id, Dosings.Drops(timesADay: 2)), Item(added.Id)));
        await edited.ShouldBeOkAsync();
        var read = await ReadAsync(owner, protocol.Id);
        read.Items.Select(i => i.Drug.Id).ShouldBe([shared.Id, first.Id, added.Id]);
        read.Items[0].Drug.Withdrawn.ShouldBeTrue();
        read.Items[1].Dosing.FrequencyValue.ShouldBe(2);
    }

    [Fact]
    [Trait("Case", "CAT-150")]
    public async Task The_withdrawn_lines_override_eye_and_place_may_change()
    {
        var (clinic, owner) = await ClinicAsync();
        var shared = await Data.SharedDrug();
        var own = await Data.Drug(clinic);
        var protocol = await Data.Protocol(clinic).With(shared.Id, Dosings.Drops(eye: "right")).With(own);
        await Data.WithdrawSharedDrugAsync(shared.Id);

        await (await owner.PutAsync(Protocol(protocol.Id), ProtocolBody(protocol.Name,
            Item(shared.Id, Dosings.Drops(timesADay: 2, eye: "right")), Item(own.Id)))).ShouldBeOkAsync();
        (await ReadAsync(owner, protocol.Id)).Items[0].Dosing.FrequencyValue.ShouldBe(2);
        await (await owner.PutAsync(Protocol(protocol.Id), ProtocolBody(protocol.Name,
            Item(shared.Id, Dosings.Drops(timesADay: 2, eye: "left")), Item(own.Id)))).ShouldBeOkAsync();
        (await ReadAsync(owner, protocol.Id)).Items[0].Dosing.Eye.ShouldBe("left");
        await (await owner.PutAsync(Protocol(protocol.Id), ProtocolBody(protocol.Name,
            Item(own.Id), Item(shared.Id, Dosings.Drops(timesADay: 2, eye: "left"))))).ShouldBeOkAsync();

        var read = await ReadAsync(owner, protocol.Id);
        read.Items.Select(i => i.Drug.Id).ShouldBe([own.Id, shared.Id]);
        read.Items[1].Drug.Withdrawn.ShouldBeTrue();
    }

    [Fact]
    [Trait("Case", "CAT-151")]
    public async Task A_second_line_of_a_withdrawn_drug_is_400_drugWithdrawn_while_its_stored_lines_pass()
    {
        var (clinic, owner) = await ClinicAsync();
        var shared = await Data.SharedDrug();
        var own = await Data.Drug(clinic);
        var single = await Data.Protocol(clinic).With(shared.Id, Dosings.Drops(eye: "right")).With(own);
        var both = await Data.Protocol(clinic).With(shared.Id, Dosings.Drops(eye: "right")).With(shared.Id, Dosings.Drops(eye: "left"));
        await Data.WithdrawSharedDrugAsync(shared.Id);
        var singleBefore = await ReadAsync(owner, single.Id);

        var problem = await (await owner.PutAsync(Protocol(single.Id), ProtocolBody(single.Name,
                Item(shared.Id, Dosings.Drops(eye: "right")), Item(own.Id), Item(shared.Id, Dosings.Drops(eye: "left")))))
            .ShouldBeProblemAsync(HttpStatusCode.BadRequest, "drugWithdrawn");

        problem.ShouldHaveError("items[2].drugId", "drugWithdrawn");
        Lines(await ReadAsync(owner, single.Id)).ShouldBe(Lines(singleBefore));
        var bothHeld = await ReadAsync(owner, both.Id);
        await (await owner.PutAsync(Protocol(both.Id), ProtocolBody(both.Name, Unchanged(bothHeld)))).ShouldBeOkAsync();
        (await ReadAsync(owner, both.Id)).Items.Select(i => (i.Drug.Id, i.Dosing.Eye)).ShouldBe([(shared.Id, "right"), (shared.Id, "left")]);
    }

    [Fact]
    [Trait("Case", "CAT-152")]
    public async Task A_new_protocol_with_a_withdrawn_drug_is_400_drugWithdrawn_and_nothing_is_created()
    {
        var (clinic, owner) = await ClinicAsync();
        var shared = await Data.SharedDrug().Withdrawn();
        var own = await Data.Drug(clinic);
        var name = Unique.Name("Refused", "مرفوض");

        var problem = await (await owner.PostAsync(ProtocolsUrl, ProtocolBody(name, Item(own.Id), Item(shared.Id))))
            .ShouldBeProblemAsync(HttpStatusCode.BadRequest, "drugWithdrawn");

        problem.ShouldHaveError("items[1].drugId", "drugWithdrawn");
        (await App.QueryDbAsync(db => db.Protocols.IgnoreQueryFilters().CountAsync(p => p.Name == name))).ShouldBe(0);
    }

    [Fact]
    [Trait("Case", "CAT-153")]
    public async Task A_withdrawn_line_removed_and_saved_cannot_be_added_back()
    {
        var (clinic, owner) = await ClinicAsync();
        var shared = await Data.SharedDrug();
        var own = await Data.Drug(clinic);
        var protocol = await Data.Protocol(clinic).With(shared.Id).With(own);
        await Data.WithdrawSharedDrugAsync(shared.Id);
        await (await owner.PutAsync(Protocol(protocol.Id), ProtocolBody(protocol.Name, Item(own.Id)))).ShouldBeOkAsync();

        var problem = await (await owner.PutAsync(Protocol(protocol.Id), ProtocolBody(protocol.Name, Item(own.Id), Item(shared.Id))))
            .ShouldBeProblemAsync(HttpStatusCode.BadRequest, "drugWithdrawn");

        problem.ShouldHaveError("items[1].drugId", "drugWithdrawn");
        (await ReadAsync(owner, protocol.Id)).Items.Select(i => i.Drug.Id).ShouldBe([own.Id]);
    }

    [Fact]
    [Trait("Case", "CAT-154")]
    public async Task The_drugWithdrawn_field_carries_the_lines_request_index_counting_the_dropped_nulls()
    {
        var (clinic, owner) = await ClinicAsync();
        var shared = await Data.SharedDrug().Withdrawn();
        var own = await Data.Drug(clinic);
        var existing = await Data.Protocol(clinic).With(own);

        var created = await (await owner.PostAsync(ProtocolsUrl, ProtocolBody(Unique.Name("Nulls", "فراغ"), Item(own.Id), null, Item(shared.Id))))
            .ShouldBeProblemAsync(HttpStatusCode.BadRequest, "drugWithdrawn");
        var updated = await (await owner.PutAsync(Protocol(existing.Id), ProtocolBody(existing.Name, null, Item(own.Id), null, Item(shared.Id))))
            .ShouldBeProblemAsync(HttpStatusCode.BadRequest, "drugWithdrawn");

        created.ShouldHaveError("items[2].drugId", "drugWithdrawn");
        updated.ShouldHaveError("items[3].drugId", "drugWithdrawn");
    }

    [Fact]
    [Trait("Case", "CAT-164")]
    public async Task Withdraw_and_restore_are_idempotent_and_keep_the_first_withdrawal_time()
    {
        // Its own sessions: after each clock jump a new sign-in (the shared session's access token would be expired)
        var admin = await Login.SuperAdminAsync();
        var drug = await Data.SharedDrug();
        var first = Clock.GetUtcNow().UtcDateTime;

        await (await admin.PostAsync(Withdraw(drug.Id))).ShouldBeAsync(HttpStatusCode.NoContent);
        (await admin.AdminDrugAsync(drug.Id)).WithdrawnAt.ShouldBe(first);
        Clock.Advance(TimeSpan.FromMinutes(10));
        admin = await Login.SuperAdminAsync();
        await (await admin.PostAsync(Withdraw(drug.Id))).ShouldBeAsync(HttpStatusCode.NoContent);
        var twice = await admin.AdminDrugAsync(drug.Id);
        (twice.Withdrawn, twice.WithdrawnAt).ShouldBe((true, first));

        await (await admin.PostAsync(Restore(drug.Id))).ShouldBeAsync(HttpStatusCode.NoContent);
        var restored = await admin.AdminDrugAsync(drug.Id);
        (restored.Withdrawn, restored.WithdrawnAt).ShouldBe((false, (DateTime?)null));
        await (await admin.PostAsync(Restore(drug.Id))).ShouldBeAsync(HttpStatusCode.NoContent);
        (await admin.AdminDrugAsync(drug.Id)).WithdrawnAt.ShouldBeNull();

        Clock.Advance(TimeSpan.FromHours(1));
        admin = await Login.SuperAdminAsync();
        var again = Clock.GetUtcNow().UtcDateTime;
        await (await admin.PostAsync(Withdraw(drug.Id))).ShouldBeAsync(HttpStatusCode.NoContent);
        var withdrawnAgain = await admin.AdminDrugAsync(drug.Id);
        (withdrawnAgain.Withdrawn, withdrawnAgain.WithdrawnAt).ShouldBe((true, again));
    }

    [Fact]
    [Trait("Case", "CAT-165")]
    public async Task A_drug_withdrawn_while_the_editor_holds_it_as_a_stored_line_saves_with_200()
    {
        var (clinic, owner) = await ClinicAsync();
        var shared = await Data.SharedDrug();
        var own = await Data.Drug(clinic);
        var protocol = await Data.Protocol(clinic).With(own).With(shared.Id, Dosings.AskEye());
        var held = await ReadAsync(owner, protocol.Id);
        held.Items[1].Drug.Withdrawn.ShouldBeFalse("the editor opened before the withdrawal");

        await (await (await AdminAsync()).PostAsync(Withdraw(shared.Id))).ShouldBeAsync(HttpStatusCode.NoContent);

        var response = await owner.PutAsync(Protocol(protocol.Id), ProtocolBody(protocol.Name + " saved", Unchanged(held)));
        await response.ShouldBeOkAsync();
        var saved = await ReadAsync(owner, protocol.Id);
        saved.Items.Select(i => i.Drug.Id).ShouldBe([own.Id, shared.Id]);
        saved.Items[1].Drug.Withdrawn.ShouldBeTrue();
    }
}
