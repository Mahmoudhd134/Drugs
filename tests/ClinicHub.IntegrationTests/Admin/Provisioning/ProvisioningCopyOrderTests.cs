using ClinicHub.Application.Features.Platform.Clinics.Commands.CreateClinic;
using ClinicHub.IntegrationTests.Harness.Builders;
using ClinicHub.IntegrationTests.Harness.Hosting;
using Microsoft.EntityFrameworkCore;
using Shouldly;

namespace ClinicHub.IntegrationTests.Admin.Provisioning;

/// <summary>
/// The template copy's order and its failures (platform-admin tech § Provisioning; design M1.7 § 9 M1.7b; decision
/// D32): the own drugs and the protocols are copied in the template's order (by id), each protocol's lines in their
/// order; a missing template, or a template line on a drug neither shared nor the template's, fails the create and
/// leaves nothing (the exception names the cause; through the API it is a 500, ADM-077). Each test reads the template
/// as a whole (it accumulates the class's data) and restores what it broke.
/// </summary>
[Collection(AdminCollection3.Name)]
[Trait("Area", "admin")]
public class ProvisioningCopyOrderTests(AppFixture app) : IntegrationTest(app)
{
    [Fact]
    [Trait("Case", "CAT-239")]
    public async Task The_copies_are_in_the_templates_order_drugs_protocols_and_lines()
    {
        var templateId = await App.TemplateClinicIdAsync();
        // Names not in id order, so a copy sorted any other way shows
        var zeta = await Data.Drug(templateId).Named(Unique.Name("Zeta drop", "قطرة ز"));
        var alpha = await Data.Drug(templateId).Named(Unique.Name("Alpha drop", "قطرة أ"));
        var mu = await Data.Drug(templateId).Named(Unique.Name("Mu drop", "قطرة م"));
        await Data.Protocol(templateId).Named(Unique.Name("Second by name", "ب")).With(mu).With(zeta).With(alpha);
        await Data.Protocol(templateId).Named(Unique.Name("First by name", "أ")).With(alpha).With(mu);

        var (clinicId, _) = await ProvisionedCatalog.CreateClinicAsync(App);

        (await DrugNamesByIdAsync(clinicId)).ShouldBe(await DrugNamesByIdAsync(templateId), "the own drugs, in the template's order");
        var copied = await LinesAsync(clinicId);
        var template = await LinesAsync(templateId);
        copied.Select(p => p.Name).ShouldBe(template.Select(p => p.Name), "the protocols, in the template's order");
        for (var i = 0; i < template.Count; i++)
            copied[i].Lines.ShouldBe(template[i].Lines, $"the lines of '{template[i].Name}' (drug, order), inserted in their order");
    }

    [Fact]
    [Trait("Case", "CAT-240")]
    public async Task Without_a_template_clinic_the_create_fails_and_writes_nothing()
    {
        var templateId = await App.TemplateClinicIdAsync();
        var name = Unique.Name("No template", "بلا نموذج");
        var before = await App.RowCountsAsync();
        await App.OutsideTheApp.ExecuteAsync("""UPDATE "Clinics" SET "IsTemplate" = false WHERE "Id" = @p0""", templateId);
        try
        {
            var error = await Should.ThrowAsync<InvalidOperationException>(() =>
                App.SendAsync(new CreateClinicCommand(name, new CreateClinicOwner(Unique.Phone(), "Owner"))));

            error.Message.ShouldBe("The template clinic does not exist.");
        }
        finally
        {
            await App.OutsideTheApp.ExecuteAsync("""UPDATE "Clinics" SET "IsTemplate" = true WHERE "Id" = @p0""", templateId);
        }

        (await App.RowCountsAsync()).ShouldBe(before);
    }

    [Fact]
    [Trait("Case", "CAT-240")]
    public async Task A_template_line_on_a_drug_neither_shared_nor_the_templates_fails_the_create_and_writes_nothing()
    {
        // Only in the accepted race (a drug and a protocol using it saved in the template between the two reads); here
        // the line points at another clinic's own drug, written by SQL
        var templateId = await App.TemplateClinicIdAsync();
        var other = await Data.Clinic();
        var foreign = await Data.Drug(other);
        var protocol = await Data.Protocol(templateId).Named(Unique.Name("Broken", "معطوب"));
        var lineId = await App.OutsideTheApp.ScalarAsync<int>(
            """
            INSERT INTO "ProtocolItems" ("ClinicId", "ProtocolId", "DrugId", "Order", "CreatedAt", "UpdatedAt")
            VALUES (@p0, @p1, @p2, 0, now(), now()) RETURNING "Id"
            """, templateId, protocol.Id, foreign.Id);
        var before = await App.RowCountsAsync();
        try
        {
            var error = await Should.ThrowAsync<KeyNotFoundException>(() =>
                App.SendAsync(new CreateClinicCommand(Unique.Name("Broken copy", "نسخة"), new CreateClinicOwner(Unique.Phone(), "Owner"))));

            error.Message.ShouldBe($"Template protocol line on drug {foreign.Id}, neither shared nor the template's.");
            (await App.RowCountsAsync()).ShouldBe(before, "rolled back");
        }
        finally
        {
            await App.OutsideTheApp.ExecuteAsync("""DELETE FROM "ProtocolItems" WHERE "Id" = @p0""", lineId);
        }
    }

    private Task<List<string>> DrugNamesByIdAsync(int clinicId) => App.QueryDbAsync(db => db.Drugs.IgnoreQueryFilters()
        .Where(d => d.ClinicId == clinicId).OrderBy(d => d.Id).Select(d => d.Name).ToListAsync());

    /// <summary>
    /// The clinic's protocols by id, each with its lines as (drug name or shared id, order): by id for a copy (its insert
    /// order), by order then id for the template.
    /// </summary>
    private async Task<List<(string Name, List<string> Lines)>> LinesAsync(int clinicId)
    {
        var protocols = await App.QueryDbAsync(db => db.Protocols.IgnoreQueryFilters().Where(g => g.ClinicId == clinicId)
            .OrderBy(g => g.Id).Select(g => new { g.Id, g.Name }).ToListAsync());
        var lines = await App.QueryDbAsync(db => db.ProtocolItems.IgnoreQueryFilters().Where(i => i.ClinicId == clinicId)
            .Select(i => new { i.Id, i.ProtocolId, i.Order, Drug = i.Drug.ClinicId == null ? i.DrugId.ToString() : i.Drug.Name })
            .ToListAsync());
        var isTemplate = clinicId == await App.TemplateClinicIdAsync();
        return protocols.Select(g => (g.Name, lines.Where(i => i.ProtocolId == g.Id)
                .OrderBy(i => isTemplate ? i.Order : 0).ThenBy(i => i.Id)
                .Select(i => $"{i.Drug}#{i.Order}").ToList()))
            .ToList();
    }
}
