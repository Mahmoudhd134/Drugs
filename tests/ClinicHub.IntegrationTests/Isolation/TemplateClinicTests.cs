using System.Net;
using ClinicHub.Application.Common.Paging;
using ClinicHub.Application.Features.Catalog.Protocols;
using ClinicHub.Application.Features.Catalog.Categories;
using ClinicHub.Application.Features.Catalog.Drugs;
using ClinicHub.Application.Features.Identity.Sessions;
using ClinicHub.IntegrationTests.Admin.SharedDrugs;
using ClinicHub.IntegrationTests.Harness.Assertions;
using ClinicHub.IntegrationTests.Harness.Builders;
using ClinicHub.IntegrationTests.Harness.Hosting;
using Microsoft.EntityFrameworkCore;
using Shouldly;

namespace ClinicHub.IntegrationTests.Isolation;

/// <summary>
/// The template clinic: its own catalog, copied into a new clinic when it is created, then independent both ways
/// (clinic-scoping § القواعد, auth § القواعد); never a context of clinic staff.
/// </summary>
[Collection(IsolationCollection2.Name)]
[Trait("Area", "isolation")]
public class TemplateClinicTests(AppFixture app) : IntegrationTest(app)
{
    [Fact]
    [Trait("Case", "ISO-025")]
    public async Task The_super_admin_in_the_template_lists_the_templates_own_rows_and_every_active_shared_drug()
    {
        var templateId = await App.TemplateClinicIdAsync();
        await Data.Protocol(templateId);
        var clinic = await Data.Clinic();
        await Data.Protocol(clinic);
        var clinicOwn = await Data.Drug(clinic).Named(Unique.Name("Clinic only", "للعيادة فقط"));
        var shared = await Data.SharedDrug();
        var withdrawn = await Data.SharedDrug().Withdrawn();
        var admin = await Login.SuperAdminInTemplateAsync();
        var templateDrugs = await App.QueryDbAsync(db =>
            db.Drugs.IgnoreQueryFilters().Where(d => d.ClinicId == templateId).Select(d => d.Id).ToListAsync());
        var templateProtocols = await App.QueryDbAsync(db =>
            db.Protocols.IgnoreQueryFilters().Where(g => g.ClinicId == templateId).Select(g => g.Id).ToListAsync());

        var own = await admin.OwnDrugsAsync();
        var drugs = await admin.ClinicDrugsAsync("pageSize=100");
        var protocols = await (await admin.GetAsync("/api/v1/protocols?pageSize=100")).ReadAsync<PagedResult<ProtocolDto>>();

        own.Items.Select(d => d.Id).ShouldBe(templateDrugs, ignoreOrder: true);
        own.TotalCount.ShouldBe(templateDrugs.Count);
        drugs.TotalCount.ShouldBe(templateDrugs.Count + await App.ActiveSharedCountAsync());
        drugs.Items.Take(templateDrugs.Count).Select(d => d.Id).ShouldBe(templateDrugs, ignoreOrder: true);
        drugs.Items.Skip(templateDrugs.Count).ShouldAllBe(d => d.IsShared);
        (await admin.SearchClinicDrugsAsync(shared.Name)).Items.Select(d => d.Id).ShouldBe([shared.Id]);
        (await admin.SearchClinicDrugsAsync(withdrawn.Name)).TotalCount.ShouldBe(0);
        (await admin.SearchClinicDrugsAsync(clinicOwn.Name)).TotalCount.ShouldBe(0);
        protocols.Items.Select(g => g.Id).ShouldBe(templateProtocols, ignoreOrder: true);
        protocols.TotalCount.ShouldBe(templateProtocols.Count);
    }

    [Fact]
    [Trait("Case", "ISO-026")]
    public async Task Editing_or_deleting_the_template_leaves_a_clinics_copy_unchanged()
    {
        var templateId = await App.TemplateClinicIdAsync();
        var drug = await Data.Drug(templateId).Named(Unique.Name("Tobradex", "توبرادكس")).WithDosing(Dosings.Drops());
        var other = await Data.Drug(templateId).Named(Unique.Name("Vigamox", "فيجاموكس"));
        var shared = await Data.SharedDrug();
        var protocol = await Data.Protocol(templateId).Named(Unique.Name("Post cataract", "بعد المياه البيضاء"))
            .With(drug).With(other).With(shared.Id);
        var clinic = await Data.Clinic();
        var copyBefore = await CatalogOfAsync(clinic.Id);
        var admin = await Login.SuperAdminInTemplateAsync();

        await (await admin.PutAsync($"/api/v1/drugs/{drug.Id}", new
        {
            name = drug.Name + " edited", activeIngredients = "EDITED", categoryId = CategoryIds.Other, subCategoryId = (int?)null,
        })).ShouldBeOkAsync();
        await (await admin.PutAsync($"/api/v1/protocols/{protocol.Id}", new { name = protocol.Name + " edited", items = new[] { new { drugId = drug.Id } } }))
            .ShouldBeOkAsync();
        await (await admin.DeleteAsync($"/api/v1/drugs/{other.Id}")).ShouldBeAsync(HttpStatusCode.NoContent);

        (await CatalogOfAsync(clinic.Id)).ShouldBe(copyBefore);
        copyBefore.ShouldContain(drug.Name);
        copyBefore.ShouldContain(other.Name);
        copyBefore.ShouldContain(protocol.Name);
        copyBefore.ShouldContain($"shared#{shared.Id}");

        await (await admin.DeleteAsync($"/api/v1/protocols/{protocol.Id}")).ShouldBeAsync(HttpStatusCode.NoContent);

        (await CatalogOfAsync(clinic.Id)).ShouldBe(copyBefore);
    }

    [Fact]
    [Trait("Tier", "Smoke")]
    [Trait("Case", "ISO-027")]
    public async Task Editing_or_deleting_a_clinics_copy_leaves_the_template_unchanged()
    {
        var templateId = await App.TemplateClinicIdAsync();
        var drug = await Data.Drug(templateId).Named(Unique.Name("Tobradex", "توبرادكس"));
        var other = await Data.Drug(templateId).Named(Unique.Name("Vigamox", "فيجاموكس"));
        var shared = await Data.SharedDrug();
        var protocol = await Data.Protocol(templateId).Named(Unique.Name("Post cataract", "بعد المياه البيضاء"))
            .With(drug).With(other).With(shared.Id);
        var templateBefore = await CatalogOfAsync(templateId);
        var clinic = await Data.Clinic();
        var owner = await Login.OwnerAsync(clinic);
        var copies = await owner.OwnDrugsAsync();
        copies.Items.ShouldNotContain(d => d.IsShared || d.Id == shared.Id, "a shared drug is not a copy");
        var drugCopy = copies.Items.Single(d => d.Name == drug.Name);
        var otherCopy = copies.Items.Single(d => d.Name == other.Name);
        var protocolCopy = (await (await owner.GetAsync("/api/v1/protocols?pageSize=100")).ReadAsync<PagedResult<ProtocolDto>>())
            .Items.Single(g => g.Name == protocol.Name);

        // The shared drug of the copied protocol is not the clinic's: it can't change it
        await (await owner.PutAsync($"/api/v1/drugs/{shared.Id}", new
        {
            name = shared.Name + " mine", categoryId = CategoryIds.Eye, subCategoryId = SubCategoryIds.Glaucoma,
        })).ShouldBeProblemAsync(HttpStatusCode.Conflict, "sharedDrugReadOnly");
        await (await owner.DeleteAsync($"/api/v1/drugs/{shared.Id}")).ShouldBeProblemAsync(HttpStatusCode.Conflict, "sharedDrugReadOnly");
        await (await owner.PutAsync($"/api/v1/drugs/{drugCopy.Id}", new
        {
            name = drug.Name + " mine", activeIngredients = "MINE", categoryId = CategoryIds.Other, subCategoryId = (int?)null,
        })).ShouldBeOkAsync();
        await (await owner.PutAsync($"/api/v1/protocols/{protocolCopy.Id}", new { name = protocol.Name + " mine", items = new[] { new { drugId = drugCopy.Id } } }))
            .ShouldBeOkAsync();
        await (await owner.DeleteAsync($"/api/v1/drugs/{otherCopy.Id}")).ShouldBeAsync(HttpStatusCode.NoContent);
        await (await owner.DeleteAsync($"/api/v1/protocols/{protocolCopy.Id}")).ShouldBeAsync(HttpStatusCode.NoContent);

        (await CatalogOfAsync(templateId)).ShouldBe(templateBefore);
        (await App.QueryDbAsync(db => db.Drugs.IgnoreQueryFilters().Where(d => d.Id == shared.Id).Select(d => d.Name).SingleAsync()))
            .ShouldBe(shared.Name);
    }

    [Fact]
    [Trait("Case", "ISO-028")]
    public async Task A_clinic_created_after_a_template_edit_gets_the_edited_version()
    {
        var templateId = await App.TemplateClinicIdAsync();
        var drug = await Data.Drug(templateId).Named(Unique.Name("Tobradex", "توبرادكس"));
        var protocol = await Data.Protocol(templateId).Named(Unique.Name("Post cataract", "بعد المياه البيضاء")).With(drug);
        var shared = await Data.SharedDrug();
        var admin = await Login.SuperAdminInTemplateAsync();
        var editedDrug = drug.Name + " edited";
        var editedProtocol = protocol.Name + " edited";
        await (await admin.PutAsync($"/api/v1/drugs/{drug.Id}", new
        {
            name = editedDrug, activeIngredients = "EDITED INGREDIENT", defaultDosing = Dosings.Tablets(),
            categoryId = CategoryIds.Other, subCategoryId = (int?)SubCategoryIds.Unclassified,
        })).ShouldBeOkAsync();
        await (await admin.PutAsync($"/api/v1/protocols/{protocol.Id}", new
        {
            name = editedProtocol, items = new[] { new { drugId = drug.Id }, new { drugId = shared.Id } },
        })).ShouldBeOkAsync();

        var clinic = await Data.Clinic();

        var catalog = await CatalogOfAsync(clinic.Id);
        catalog.ShouldContain(editedDrug);
        catalog.ShouldContain(editedProtocol);
        catalog.ShouldNotContain(drug.Name + "|");
        var copy = await App.QueryDbAsync(db => db.Drugs.IgnoreQueryFilters().SingleAsync(d => d.ClinicId == clinic.Id && d.Name == editedDrug));
        copy.DefaultDosing.ShouldNotBeNull();
        copy.DefaultDosing.DoseUnit.ShouldBe("tablet");
        (copy.ActiveIngredients, copy.CategoryId, copy.SubCategoryId).ShouldBe(("EDITED INGREDIENT", CategoryIds.Other, (int?)SubCategoryIds.Unclassified));
        var lines = await App.QueryDbAsync(db => db.ProtocolItems.IgnoreQueryFilters()
            .Where(i => i.ClinicId == clinic.Id).OrderBy(i => i.Order).Select(i => i.DrugId).ToListAsync());
        lines.ShouldBe([copy.Id, shared.Id], "the own line points to the clinic's copy, the shared line keeps the shared id");
    }

    [Fact]
    [Trait("Case", "ISO-029")]
    public async Task The_template_is_never_a_context_of_clinic_staff()
    {
        var templateId = await App.TemplateClinicIdAsync();
        var phone = Unique.Phone();
        var a = await Data.Clinic().OwnedBy(phone);
        var b = await Data.Clinic();
        await Data.Staff(b).WithPhone(phone).WithRole("Assistant");
        var single = await Login.OwnerAsync(b);

        var several = await Login.AsAsync(phone);
        var contexts = await (await several.GetAsync("/api/v1/auth/contexts")).ReadAsync<List<ContextDto>>();

        several.Auth.Contexts.Select(c => c.ClinicId).ShouldBe([a.Id, b.Id], ignoreOrder: true);
        contexts.Select(c => c.ClinicId).ShouldBe([a.Id, b.Id], ignoreOrder: true);
        single.Auth.Contexts.ShouldNotContain(c => c.ClinicId == templateId || c.IsTemplate == true);
        (await (await single.GetAsync("/api/v1/auth/contexts")).ReadAsync<List<ContextDto>>())
            .ShouldNotContain(c => c.ClinicId == templateId || c.IsTemplate == true);
        await (await several.SwitchContextAsync("clinic", templateId)).ShouldBeProblemAsync(HttpStatusCode.Forbidden, "noAccess");
    }

    /// <summary>
    /// A clinic's own drugs (name, description, dosing, ingredients, category) and protocols (name, lines: drug name, own
    /// or the shared id, dosing), as one comparable text.
    /// </summary>
    private Task<string> CatalogOfAsync(int clinicId) => App.QueryDbAsync(async db =>
    {
        var drugs = await db.Drugs.IgnoreQueryFilters().Where(d => d.ClinicId == clinicId).OrderBy(d => d.Id).ToListAsync();
        var protocols = await db.Protocols.IgnoreQueryFilters().Where(g => g.ClinicId == clinicId)
            .Include(g => g.Items).ThenInclude(i => i.Drug).OrderBy(g => g.Id).ToListAsync();
        return string.Join("\n", drugs.Select(d =>
                   $"{d.Id}|{d.Name}|{d.Description}|{System.Text.Json.JsonSerializer.Serialize(d.DefaultDosing)}|{d.ActiveIngredients}|{d.CategoryId}|{d.SubCategoryId}"))
               + "\n#\n"
               + string.Join("\n", protocols.Select(g =>
                   $"{g.Id}|{g.Name}|{string.Join(",", g.Items.OrderBy(i => i.Order).Select(i => i.Drug.Name + (i.Drug.ClinicId == null ? $"(shared#{i.DrugId})" : "(own)") + ":" + System.Text.Json.JsonSerializer.Serialize(i.Dosing)))}"));
    });
}
