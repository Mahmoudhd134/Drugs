using System.Net;
using ClinicHub.Application.Common.Paging;
using ClinicHub.Application.Features.Catalog.Protocols;
using ClinicHub.Application.Features.Catalog.Drugs;
using ClinicHub.Application.Features.Identity.Sessions;
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
    public async Task The_super_admin_in_the_template_lists_only_the_templates_rows()
    {
        var templateId = await App.TemplateClinicIdAsync();
        await Data.Protocol(templateId);
        var clinic = await Data.Clinic();
        await Data.Protocol(clinic);
        var admin = await Login.SuperAdminInTemplateAsync();
        var templateDrugs = await App.QueryDbAsync(db =>
            db.Drugs.IgnoreQueryFilters().Where(d => d.ClinicId == templateId).Select(d => d.Id).ToListAsync());
        var templateProtocols = await App.QueryDbAsync(db =>
            db.Protocols.IgnoreQueryFilters().Where(g => g.ClinicId == templateId).Select(g => g.Id).ToListAsync());

        var drugs = await (await admin.GetAsync("/api/v1/drugs?pageSize=100")).ReadAsync<PagedResult<DrugDto>>();
        var groups = await (await admin.GetAsync("/api/v1/drug-groups?pageSize=100")).ReadAsync<PagedResult<ProtocolDto>>();

        drugs.Items.Select(d => d.Id).ShouldBe(templateDrugs, ignoreOrder: true);
        drugs.TotalCount.ShouldBe(templateDrugs.Count);
        groups.Items.Select(g => g.Id).ShouldBe(templateProtocols, ignoreOrder: true);
        groups.TotalCount.ShouldBe(templateProtocols.Count);
    }

    [Fact]
    [Trait("Case", "ISO-026")]
    public async Task Editing_or_deleting_the_template_leaves_a_clinics_copy_unchanged()
    {
        var templateId = await App.TemplateClinicIdAsync();
        var drug = await Data.Drug(templateId).Named(Unique.Name("Tobradex", "توبرادكس")).WithDosing(Dosings.Drops());
        var other = await Data.Drug(templateId).Named(Unique.Name("Vigamox", "فيجاموكس"));
        var group = await Data.Protocol(templateId).Named(Unique.Name("Post cataract", "بعد المياه البيضاء")).With(drug).With(other);
        var clinic = await Data.Clinic();
        var copyBefore = await CatalogOfAsync(clinic.Id);
        var admin = await Login.SuperAdminInTemplateAsync();

        await (await admin.PutAsync($"/api/v1/drugs/{drug.Id}", new { name = drug.Name + " edited" })).ShouldBeOkAsync();
        await (await admin.PutAsync($"/api/v1/drug-groups/{group.Id}", new { name = group.Name + " edited", items = new[] { new { drugId = drug.Id } } }))
            .ShouldBeOkAsync();
        await (await admin.DeleteAsync($"/api/v1/drugs/{other.Id}")).ShouldBeAsync(HttpStatusCode.NoContent);

        (await CatalogOfAsync(clinic.Id)).ShouldBe(copyBefore);
        copyBefore.ShouldContain(drug.Name);
        copyBefore.ShouldContain(other.Name);
        copyBefore.ShouldContain(group.Name);

        await (await admin.DeleteAsync($"/api/v1/drug-groups/{group.Id}")).ShouldBeAsync(HttpStatusCode.NoContent);

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
        var group = await Data.Protocol(templateId).Named(Unique.Name("Post cataract", "بعد المياه البيضاء")).With(drug).With(other);
        var templateBefore = await CatalogOfAsync(templateId);
        var clinic = await Data.Clinic();
        var owner = await Login.OwnerAsync(clinic);
        var copies = await (await owner.GetAsync("/api/v1/drugs?pageSize=100")).ReadAsync<PagedResult<DrugDto>>();
        var drugCopy = copies.Items.Single(d => d.Name == drug.Name);
        var otherCopy = copies.Items.Single(d => d.Name == other.Name);
        var groupCopy = (await (await owner.GetAsync("/api/v1/drug-groups?pageSize=100")).ReadAsync<PagedResult<ProtocolDto>>())
            .Items.Single(g => g.Name == group.Name);

        await (await owner.PutAsync($"/api/v1/drugs/{drugCopy.Id}", new { name = drug.Name + " mine" })).ShouldBeOkAsync();
        await (await owner.PutAsync($"/api/v1/drug-groups/{groupCopy.Id}", new { name = group.Name + " mine", items = new[] { new { drugId = drugCopy.Id } } }))
            .ShouldBeOkAsync();
        await (await owner.DeleteAsync($"/api/v1/drugs/{otherCopy.Id}")).ShouldBeAsync(HttpStatusCode.NoContent);
        await (await owner.DeleteAsync($"/api/v1/drug-groups/{groupCopy.Id}")).ShouldBeAsync(HttpStatusCode.NoContent);

        (await CatalogOfAsync(templateId)).ShouldBe(templateBefore);
    }

    [Fact]
    [Trait("Case", "ISO-028")]
    public async Task A_clinic_created_after_a_template_edit_gets_the_edited_version()
    {
        var templateId = await App.TemplateClinicIdAsync();
        var drug = await Data.Drug(templateId).Named(Unique.Name("Tobradex", "توبرادكس"));
        var group = await Data.Protocol(templateId).Named(Unique.Name("Post cataract", "بعد المياه البيضاء")).With(drug);
        var admin = await Login.SuperAdminInTemplateAsync();
        var editedDrug = drug.Name + " edited";
        var editedProtocol = group.Name + " edited";
        await (await admin.PutAsync($"/api/v1/drugs/{drug.Id}", new { name = editedDrug, defaultDosing = Dosings.Tablets() })).ShouldBeOkAsync();
        await (await admin.PutAsync($"/api/v1/drug-groups/{group.Id}", new { name = editedProtocol, items = new[] { new { drugId = drug.Id } } }))
            .ShouldBeOkAsync();

        var clinic = await Data.Clinic();

        var catalog = await CatalogOfAsync(clinic.Id);
        catalog.ShouldContain(editedDrug);
        catalog.ShouldContain(editedProtocol);
        catalog.ShouldNotContain(drug.Name + "|");
        var copy = await App.QueryDbAsync(db => db.Drugs.IgnoreQueryFilters().SingleAsync(d => d.ClinicId == clinic.Id && d.Name == editedDrug));
        copy.DefaultDosing.ShouldNotBeNull();
        copy.DefaultDosing.DoseUnit.ShouldBe("tablet");
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

    /// <summary>A clinic's drugs (name, description, dosing) and groups (name, line drug names), as one comparable text.</summary>
    private Task<string> CatalogOfAsync(int clinicId) => App.QueryDbAsync(async db =>
    {
        var drugs = await db.Drugs.IgnoreQueryFilters().Where(d => d.ClinicId == clinicId).OrderBy(d => d.Id).ToListAsync();
        var groups = await db.Protocols.IgnoreQueryFilters().Where(g => g.ClinicId == clinicId)
            .Include(g => g.Items).ThenInclude(i => i.Drug).OrderBy(g => g.Id).ToListAsync();
        return string.Join("\n", drugs.Select(d =>
                   $"{d.Id}|{d.Name}|{d.Description}|{System.Text.Json.JsonSerializer.Serialize(d.DefaultDosing)}"))
               + "\n#\n"
               + string.Join("\n", groups.Select(g =>
                   $"{g.Id}|{g.Name}|{string.Join(",", g.Items.OrderBy(i => i.Order).Select(i => i.Drug.Name + ":" + System.Text.Json.JsonSerializer.Serialize(i.Dosing)))}"));
    });
}
