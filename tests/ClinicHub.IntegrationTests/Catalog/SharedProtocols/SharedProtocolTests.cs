using System.Net;
using ClinicHub.Application.Features.Catalog.Protocols;
using ClinicHub.IntegrationTests.Admin.SharedDrugs;
using ClinicHub.IntegrationTests.Harness.Assertions;
using ClinicHub.IntegrationTests.Harness.Builders;
using ClinicHub.IntegrationTests.Harness.Clients;
using ClinicHub.IntegrationTests.Harness.Hosting;
using Shouldly;
using static ClinicHub.IntegrationTests.Admin.SharedDrugs.SharedCatalogApi;
using static ClinicHub.IntegrationTests.Admin.SharedDrugs.SharedCatalogRoutes;

namespace ClinicHub.IntegrationTests.Catalog.SharedProtocols;

/// <summary>
/// Protocols mixing shared and own drugs (design M1.7 D4, § 8): the lines keep one drug id each, the duplicate rule uses
/// the effective eye, a super admin rename shows at the next load, an own drug's delete removes only its lines.
/// </summary>
[Collection(WithdrawnDrugsCollection.Name)]
[Trait("Area", "catalog")]
public class SharedProtocolTests(AppFixture app) : IntegrationTest(app)
{
    private const string Vigamox = "VIGAMOX 0.5% EYE DROPS 5 ML";

    private async Task<(ClinicHandle Clinic, ApiClient Owner)> ClinicAsync()
    {
        var clinic = await App.PerClassAsync("shared-protocols:clinic", () => Data.Clinic().CreateAsync());
        return (clinic, await Login.SharedAsync("shared-protocols:owner", () => Login.OwnerAsync(clinic)));
    }

    private static async Task<ProtocolDto> ReadAsync(ApiClient client, int protocolId) =>
        await (await client.GetAsync(Protocol(protocolId))).ReadAsync<ProtocolDto>();

    [Fact]
    [Trait("Case", "CAT-173")]
    public async Task A_protocol_with_a_shared_and_an_own_drug_is_read_back_in_order_with_its_overrides()
    {
        var (clinic, owner) = await ClinicAsync();
        var shared = await Data.Shared(Vigamox);
        var own = await Data.Drug(clinic).WithDosing(Dosings.Tablets());
        var sharedOverride = Dosings.Drops(timesADay: 3, weeks: 2, eye: "right");

        var response = await owner.PostAsync(ProtocolsUrl, ProtocolBody(Unique.Name("Post cataract", "بعد المياه البيضاء"),
            Item(shared.Id, sharedOverride), Item(own.Id)));

        await response.ShouldBeAsync(HttpStatusCode.Created);
        var created = await response.ReadAsync<ProtocolDto>();
        foreach (var protocol in new[] { created, await ReadAsync(owner, created.Id) })
        {
            protocol.Items.Select(i => (i.Drug.Id, i.Drug.IsShared, i.Drug.Withdrawn)).ShouldBe([(shared.Id, true, false), (own.Id, false, false)]);
            protocol.Items[0].Drug.Name.ShouldBe(Vigamox);
            protocol.Items[0].Drug.DefaultDosing.ShouldBeNull();
            var line = protocol.Items[0].Dosing;
            (line.DoseAmount, line.DoseUnit, line.FrequencyValue, line.DurationValue, line.Eye).ShouldBe((1m, "drop", 3, 2, "right"));
            protocol.Items[1].Dosing.ShouldBeNull();
            protocol.Items[1].Drug.DefaultDosing.DoseUnit.ShouldBe("tablet");
        }
    }

    [Fact]
    [Trait("Case", "CAT-174")]
    public async Task One_shared_drug_may_be_in_a_protocol_once_per_effective_eye()
    {
        var (_, owner) = await ClinicAsync();
        var shared = await Data.SharedDrug();

        await (await owner.PostAsync(ProtocolsUrl, ProtocolBody(Unique.Name("Both eyes", "العينين"),
            Item(shared.Id, Dosings.Drops(eye: "right")), Item(shared.Id, Dosings.Drops(eye: "left"))))).ShouldBeAsync(HttpStatusCode.Created);
        await (await owner.PostAsync(ProtocolsUrl, ProtocolBody(Unique.Name("Same eye", "نفس العين"),
                Item(shared.Id, Dosings.Drops(eye: "right")), Item(shared.Id, Dosings.Drops(timesADay: 2, eye: "right")))))
            .ShouldBeProblemAsync(HttpStatusCode.BadRequest, "duplicateProtocolItem");
        await (await owner.PostAsync(ProtocolsUrl, ProtocolBody(Unique.Name("No eye", "بلا عين"), Item(shared.Id), Item(shared.Id))))
            .ShouldBeProblemAsync(HttpStatusCode.BadRequest, "duplicateProtocolItem");
    }

    [Fact]
    [Trait("Case", "CAT-176")]
    public async Task Saving_an_editor_opened_before_a_shared_drugs_rename_is_200_with_the_new_name()
    {
        var (clinic, owner) = await ClinicAsync();
        var shared = await Data.SharedDrug();
        var protocol = await Data.Protocol(clinic).With(shared.Id).With(await Data.Drug(clinic));
        var held = await ReadAsync(owner, protocol.Id);
        var newName = $"RENAMED {Unique.Next()} EYE DROPS 5 ML";

        await Data.UpdateSharedDrugAsync(shared.Id, newName);

        var response = await owner.PutAsync(Protocol(protocol.Id),
            ProtocolBody(protocol.Name, held.Items.Select(i => Item(i.Drug.Id, i.Dosing)).ToArray()));
        await response.ShouldBeOkAsync();
        (await response.ReadAsync<ProtocolDto>()).Items[0].Drug.Name.ShouldBe(newName);
        (await ReadAsync(owner, protocol.Id)).Items[0].Drug.Name.ShouldBe(newName);
    }

    [Fact]
    [Trait("Case", "CAT-177")]
    public async Task Deleting_an_own_drug_removes_its_lines_and_keeps_the_shared_ones()
    {
        var (clinic, owner) = await ClinicAsync();
        var first = await Data.SharedDrug();
        var second = await Data.SharedDrug();
        var own = await Data.Drug(clinic);
        var protocol = await Data.Protocol(clinic).With(first.Id, Dosings.AskEye()).With(own).With(second.Id);

        await (await owner.DeleteAsync(ClinicDrug(own.Id))).ShouldBeAsync(HttpStatusCode.NoContent);

        var read = await ReadAsync(owner, protocol.Id);
        read.Items.Select(i => i.Drug.Id).ShouldBe([first.Id, second.Id]);
        read.Items[0].Dosing.Eye.ShouldBe("ask");
    }
}
