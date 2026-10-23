using System.Net;
using System.Text.Json.Nodes;
using ClinicHub.Application.Common.Search;
using ClinicHub.Application.Features.Catalog.Categories;
using ClinicHub.Application.Features.Catalog.Protocols;
using ClinicHub.Application.Features.Platform.SharedDrugs;
using ClinicHub.IntegrationTests.Harness.Assertions;
using ClinicHub.IntegrationTests.Harness.Builders;
using ClinicHub.IntegrationTests.Harness.Clients;
using ClinicHub.IntegrationTests.Harness.Hosting;
using Microsoft.EntityFrameworkCore;
using Shouldly;
using static ClinicHub.IntegrationTests.Admin.SharedDrugs.SharedCatalogApi;
using static ClinicHub.IntegrationTests.Admin.SharedDrugs.SharedCatalogRoutes;

namespace ClinicHub.IntegrationTests.Admin.SharedDrugs;

/// <summary>
/// The super admin's shared catalog (design M1.7 D3, D8, § 7): create, edit, the hidden Arabic name, the 404 on own
/// drugs, the refusals for clinic tokens and the validation shared with the clinic's drug form. Every write uses the
/// test's own shared drugs and subcategories (D12), never imported rows.
/// </summary>
[Collection(SharedDrugsCollection.Name)]
[Trait("Area", "admin")]
public class SharedDrugAdminTests(AppFixture app) : IntegrationTest(app)
{
    private Task<ApiClient> AdminAsync() => Login.SharedSuperAdminAsync();

    /// <summary>An English pack-size name like the imported ones, unique in the run.</summary>
    private static string DrugName(string word) => $"{word} {Unique.Next()} EYE DROPS 5 ML";

    [Fact]
    [Trait("Case", "CAT-178")]
    public async Task A_shared_drug_created_by_the_super_admin_shows_in_every_clinic_as_shared()
    {
        var admin = await AdminAsync();
        var a = await Data.Clinic();
        var b = await Data.Clinic();
        var sub = await Data.SubCategory();
        var name = DrugName("ZOCALINE");

        var response = await admin.PostAsync(AdminDrugs, SharedDrugBody(name, "ZOCALIN HCL", "For the test", CategoryIds.Eye, sub.Id));

        await response.ShouldBeAsync(HttpStatusCode.Created);
        var created = await response.ReadAsync<AdminDrugDto>();
        created.Name.ShouldBe(name);
        created.ActiveIngredients.ShouldBe("ZOCALIN HCL");
        created.Description.ShouldBe("For the test");
        created.Withdrawn.ShouldBeFalse();
        created.WithdrawnAt.ShouldBeNull();
        created.Category.Id.ShouldBe(CategoryIds.Eye);
        created.SubCategory.ShouldNotBeNull();
        created.SubCategory.Id.ShouldBe(sub.Id);
        created.SubCategory.NameEn.ShouldBe(sub.NameEn);
        (await App.QueryDbAsync(db => db.Drugs.IgnoreQueryFilters().Where(d => d.Id == created.Id).Select(d => d.ClinicId).SingleAsync()))
            .ShouldBeNull("a shared drug has no clinic");
        foreach (var clinic in new[] { a, b })
        {
            var owner = await Login.OwnerAsync(clinic);
            var found = (await owner.SearchClinicDrugsAsync(name)).Items.ShouldHaveSingleItem();
            found.Id.ShouldBe(created.Id);
            found.IsShared.ShouldBeTrue();
            found.Withdrawn.ShouldBeFalse();
            found.DefaultDosing.ShouldBeNull();
            found.ActiveIngredients.ShouldBe("ZOCALIN HCL");
            found.Category.Id.ShouldBe(CategoryIds.Eye);
            found.SubCategory.Id.ShouldBe(sub.Id);
        }
    }

    [Fact]
    [Trait("Case", "CAT-179")]
    public async Task A_default_dosing_in_the_admin_body_is_ignored_on_create_and_update()
    {
        var admin = await AdminAsync();
        var clinic = await Data.Clinic();
        var name = DrugName("NODOSE");

        var response = await admin.PostAsync(AdminDrugs, new
        {
            name, activeIngredients = (string)null, description = (string)null,
            categoryId = CategoryIds.Eye, subCategoryId = SubCategoryIds.Glaucoma, defaultDosing = Dosings.Drops(),
        });

        await response.ShouldBeAsync(HttpStatusCode.Created);
        var node = (await response.ReadNodeAsync()).AsObject();
        node.ContainsKey("defaultDosing").ShouldBeFalse(node.ToJsonString());
        var id = node["id"]!.GetValue<int>();
        var update = await admin.PutAsync(AdminDrug(id), new
        {
            name, activeIngredients = (string)null, description = "Edited",
            categoryId = CategoryIds.Eye, subCategoryId = SubCategoryIds.Glaucoma, defaultDosing = Dosings.Tablets(),
        });
        await update.ShouldBeOkAsync();
        (await update.ReadNodeAsync()).AsObject().ContainsKey("defaultDosing").ShouldBeFalse();
        (await App.QueryDbAsync(db => db.Drugs.IgnoreQueryFilters().AsNoTracking().Where(d => d.Id == id).Select(d => d.DefaultDosing).SingleAsync()))
            .ShouldBeNull();
        var owner = await Login.OwnerAsync(clinic);
        (await owner.ClinicDrugAsync(id)).DefaultDosing.ShouldBeNull();
    }

    [Fact]
    [Trait("Case", "CAT-180")]
    public async Task An_edit_by_the_super_admin_shows_in_every_clinics_list_and_protocols_at_their_next_load()
    {
        var admin = await AdminAsync();
        var a = await Data.Clinic();
        var b = await Data.Clinic();
        var drug = await Data.SharedDrug().Named(DrugName("BEFORE")).WithIngredients("OLDINGREDIENT");
        var protocol = await Data.Protocol(a).With(drug.Id);
        var ownerA = await Login.OwnerAsync(a);
        var ownerB = await Login.OwnerAsync(b);
        (await ownerA.SearchClinicDrugsAsync(drug.Name)).Items.Select(d => d.Id).ShouldBe([drug.Id]);
        var newName = DrugName("AFTER");

        var response = await admin.PutAsync(AdminDrug(drug.Id), SharedDrugBody(newName, "NEWINGREDIENT", "New text"));

        await response.ShouldBeOkAsync();
        var edited = await response.ReadAsync<AdminDrugDto>();
        (edited.Name, edited.ActiveIngredients, edited.Description).ShouldBe((newName, "NEWINGREDIENT", "New text"));
        foreach (var owner in new[] { ownerA, ownerB })
        {
            var read = await owner.ClinicDrugAsync(drug.Id);
            (read.Name, read.ActiveIngredients, read.Description).ShouldBe((newName, "NEWINGREDIENT", "New text"));
            (await owner.SearchClinicDrugsAsync(newName)).Items.Select(d => d.Id).ShouldBe([drug.Id]);
            (await owner.SearchClinicDrugsAsync(drug.Name)).TotalCount.ShouldBe(0);
            (await owner.SearchClinicDrugsAsync("OLDINGREDIENT")).TotalCount.ShouldBe(0);
        }
        var line = (await (await ownerA.GetAsync(Protocol(protocol.Id))).ReadAsync<ProtocolDto>()).Items.ShouldHaveSingleItem();
        line.Drug.Id.ShouldBe(drug.Id);
        line.Drug.Name.ShouldBe(newName);
        line.Drug.Description.ShouldBe("New text");
    }

    [Fact]
    [Trait("Case", "CAT-181")]
    public async Task An_own_drug_id_is_404_notFound_on_every_admin_drug_route_and_stays_unchanged()
    {
        var admin = await AdminAsync();
        var clinic = await Data.Clinic();
        var own = await Data.Drug(clinic).Named(Unique.Name("Own", "خاص"));

        var answers = new[]
        {
            await admin.GetAsync(AdminDrug(own.Id)),
            await admin.PutAsync(AdminDrug(own.Id), SharedDrugBody(own.Name + " hacked")),
            await admin.PostAsync(Withdraw(own.Id)),
            await admin.PostAsync(Restore(own.Id)),
        };

        foreach (var answer in answers)
        {
            var problem = await answer.ShouldBeProblemAsync(HttpStatusCode.NotFound, "notFound");
            problem.Errors[0].Description.ShouldBe("The shared drug does not exist.");
        }
        var stored = await App.QueryDbAsync(db => db.Drugs.IgnoreQueryFilters().SingleAsync(d => d.Id == own.Id));
        stored.Name.ShouldBe(own.Name);
        stored.IsWithdrawn.ShouldBeFalse();
        stored.ClinicId.ShouldBe(clinic.Id);
    }

    [Fact]
    [Trait("Case", "CAT-184")]
    public async Task A_staff_token_or_the_template_context_is_403_forbidden_on_every_admin_catalog_route()
    {
        var clinic = await Data.Clinic();
        var drug = await Data.SharedDrug();
        var category = await Data.Category();
        var sub = await Data.SubCategory(category.Id);
        var owner = await Login.OwnerAsync(clinic);
        var inTemplate = await Login.SuperAdminInTemplateAsync();
        var routes = new (HttpMethod Method, string Url, object Body)[]
        {
            (HttpMethod.Get, AdminDrugs, null),
            (HttpMethod.Get, $"{AdminDrugs}?status=all&search=a", null),
            (HttpMethod.Get, AdminDrug(drug.Id), null),
            (HttpMethod.Post, AdminDrugs, SharedDrugBody(DrugName("REFUSED"))),
            (HttpMethod.Put, AdminDrug(drug.Id), SharedDrugBody(drug.Name + " hacked")),
            (HttpMethod.Post, Withdraw(drug.Id), null),
            (HttpMethod.Post, Restore(drug.Id), null),
            (HttpMethod.Get, AdminCategories, null),
            (HttpMethod.Post, AdminCategories, CategoryBody(Unique.Name("Refused", "x"), Unique.Name("مرفوض", "م"))),
            (HttpMethod.Put, AdminCategory(category.Id), CategoryBody("Hacked", "مخترق")),
            (HttpMethod.Post, SubCategories(category.Id), CategoryBody(Unique.Name("Refused", "x"), Unique.Name("مرفوض", "م"))),
            (HttpMethod.Put, AdminSubCategory(sub.Id), CategoryBody("Hacked", "مخترق")),
            (HttpMethod.Delete, AdminSubCategory(sub.Id), null),
            (HttpMethod.Delete, AdminCategory(category.Id), null),
        };

        foreach (var client in new[] { owner, inTemplate })
            foreach (var (method, url, body) in routes)
                await (await client.CallAsync(method, url, body)).ShouldBeProblemAsync(HttpStatusCode.Forbidden, "forbidden");

        var admin = await AdminAsync();
        var stored = await admin.AdminDrugAsync(drug.Id);
        (stored.Name, stored.Withdrawn).ShouldBe((drug.Name, false));
        var storedCategory = await admin.AdminCategoryAsync(category.Id);
        storedCategory.NameEn.ShouldBe(category.NameEn);
        storedCategory.SubCategories.ShouldHaveSingleItem().NameEn.ShouldBe(sub.NameEn);
        (await admin.SearchAdminDrugsAsync("REFUSED")).TotalCount.ShouldBe(0);
    }

    /// <summary>
    /// The same invalid bodies through the clinic's create (<c>POST /drugs</c>, no dosing), the admin create and the
    /// admin update: the expected codes and fields, in the order of § 7.
    /// </summary>
    public static TheoryData<string, object, string[], string[]> InvalidBodies => new()
    {
        {
            "every validator rule", new { name = "", activeIngredients = "AMOX\nICILLIN", description = "bad\0text", categoryId = (int?)null },
            ["nameRequired", "invalidText", "invalidText", "categoryRequired"], ["name", "activeIngredients", "description", "categoryId"]
        },
        {
            "too long", new { name = new string('N', 257), activeIngredients = new string('I', 1001), categoryId = (int?)CategoryIds.Eye },
            ["nameTooLong", "textTooLong"], ["name", "activeIngredients"]
        },
        {
            "bidi name and a tab", new { name = "ABC‮DEF", activeIngredients = "A\tB", categoryId = (int?)CategoryIds.Eye },
            ["nameInvalid", "invalidText"], ["name", "activeIngredients"]
        },
        {
            "unknown category before unknown subcategory",
            new { name = "Valid name", categoryId = (int?)UnknownId, subCategoryId = (int?)UnknownId },
            ["categoryNotFound"], ["categoryId"]
        },
        {
            "subcategory of another category",
            new { name = "Valid name", categoryId = (int?)CategoryIds.Eye, subCategoryId = (int?)SubCategoryIds.Unclassified },
            ["subCategoryNotFound"], ["subCategoryId"]
        },
        {
            "unknown subcategory", new { name = "Valid name", categoryId = (int?)CategoryIds.Eye, subCategoryId = (int?)UnknownId },
            ["subCategoryNotFound"], ["subCategoryId"]
        },
    };

    [Theory]
    [Trait("Case", "CAT-185")]
    [MemberData(nameof(InvalidBodies))]
    public async Task The_admin_create_and_update_answer_the_clinic_creates_codes_fields_and_order(string why, object body,
        string[] codes, string[] fields)
    {
        var admin = await AdminAsync();
        var clinic = await Data.Clinic();
        var owner = await Login.OwnerAsync(clinic);
        var drug = await Data.SharedDrug();
        var before = await App.QueryDbAsync(db => db.Drugs.IgnoreQueryFilters().CountAsync());

        var answers = new[]
        {
            ("clinic create", await owner.PostAsync(ClinicDrugs, body)),
            ("admin create", await admin.PostAsync(AdminDrugs, body)),
            ("admin update", await admin.PutAsync(AdminDrug(drug.Id), body)),
        };

        foreach (var (where, answer) in answers)
        {
            var problem = await answer.ShouldBeProblemAsync(HttpStatusCode.BadRequest, codes[0]);
            problem.Codes.ShouldBe(codes, ignoreOrder: false, customMessage: $"{why}: {where}");
            problem.Errors.Select(e => e.Field).ShouldBe(fields, ignoreOrder: false, customMessage: $"{why}: {where}");
        }
        (await App.QueryDbAsync(db => db.Drugs.IgnoreQueryFilters().CountAsync())).ShouldBe(before);
        (await admin.AdminDrugAsync(drug.Id)).Name.ShouldBe(drug.Name);
    }

    [Fact]
    [Trait("Case", "CAT-185")]
    public async Task An_admin_update_of_an_unknown_id_checks_the_category_before_answering_404()
    {
        var admin = await AdminAsync();

        await (await admin.PutAsync(AdminDrug(UnknownId), SharedDrugBody("Valid name", categoryId: UnknownId)))
            .ShouldBeProblemAsync(HttpStatusCode.BadRequest, "categoryNotFound");
        await (await admin.PutAsync(AdminDrug(UnknownId), SharedDrugBody("Valid name", subCategoryId: SubCategoryIds.Unclassified)))
            .ShouldBeProblemAsync(HttpStatusCode.BadRequest, "subCategoryNotFound");
        var problem = await (await admin.PutAsync(AdminDrug(UnknownId), SharedDrugBody("Valid name")))
            .ShouldBeProblemAsync(HttpStatusCode.NotFound, "notFound");
        problem.Errors[0].Description.ShouldBe("The shared drug does not exist.");
    }

    [Fact]
    [Trait("Case", "CAT-186")]
    public async Task Editing_a_withdrawn_drug_answers_200_and_it_stays_withdrawn()
    {
        var admin = await AdminAsync();
        var clinic = await Data.Clinic();
        var drug = await Data.SharedDrug().Named(DrugName("PAUSED")).Withdrawn();
        var withdrawnAt = (await admin.AdminDrugAsync(drug.Id)).WithdrawnAt;
        withdrawnAt.ShouldNotBeNull();
        Clock.Advance(TimeSpan.FromMinutes(5));
        var newName = DrugName("PAUSEDEDIT");

        var response = await admin.PutAsync(AdminDrug(drug.Id), SharedDrugBody(newName, description: "Edited while disabled"));

        await response.ShouldBeOkAsync();
        var edited = await response.ReadAsync<AdminDrugDto>();
        (edited.Name, edited.Withdrawn, edited.WithdrawnAt).ShouldBe((newName, true, withdrawnAt));
        var read = await admin.AdminDrugAsync(drug.Id);
        (read.Name, read.Description, read.Withdrawn, read.WithdrawnAt).ShouldBe((newName, "Edited while disabled", true, withdrawnAt));
        (await (await Login.OwnerAsync(clinic)).SearchClinicDrugsAsync(newName)).TotalCount.ShouldBe(0);
    }

    [Fact]
    [Trait("Case", "CAT-188")]
    public async Task A_shared_drug_moved_to_another_subcategory_moves_in_every_clinic_and_the_admin_counts_and_its_lines_stay()
    {
        var admin = await AdminAsync();
        var a = await Data.Clinic();
        var b = await Data.Clinic();
        var from = await Data.SubCategory();
        var to = await Data.SubCategory();
        var drug = await Data.SharedDrug().Named(DrugName("MOVING")).InCategory(CategoryIds.Eye, from.Id);
        var protocol = await Data.Protocol(a).With(drug.Id, Dosings.Drops(eye: "right"));
        var ownerA = await Login.OwnerAsync(a);
        var linesBefore = Json(await ReadProtocolAsync(ownerA, protocol.Id));
        var eye = await admin.AdminCategoryAsync(CategoryIds.Eye);
        eye.SubCategories.Single(s => s.Id == from.Id).DrugCount.ShouldBe(1);
        eye.SubCategories.Single(s => s.Id == to.Id).DrugCount.ShouldBe(0);

        await (await admin.PutAsync(AdminDrug(drug.Id), SharedDrugBody(drug.Name, subCategoryId: to.Id))).ShouldBeOkAsync();

        foreach (var owner in new[] { ownerA, await Login.OwnerAsync(b) })
        {
            (await owner.ClinicDrugsAsync($"categoryId={CategoryIds.Eye}&subCategoryId={to.Id}")).Items.Select(d => d.Id).ShouldBe([drug.Id]);
            (await owner.ClinicDrugsAsync($"categoryId={CategoryIds.Eye}&subCategoryId={from.Id}")).TotalCount.ShouldBe(0);
            (await owner.ClinicDrugAsync(drug.Id)).SubCategory.Id.ShouldBe(to.Id);
        }
        eye = await admin.AdminCategoryAsync(CategoryIds.Eye);
        eye.SubCategories.Single(s => s.Id == from.Id).DrugCount.ShouldBe(0);
        eye.SubCategories.Single(s => s.Id == to.Id).DrugCount.ShouldBe(1);
        Json(await ReadProtocolAsync(ownerA, protocol.Id)).ShouldBe(linesBefore);
    }

    [Fact]
    [Trait("Case", "CAT-189")]
    public async Task The_hidden_Arabic_name_survives_an_edit_that_keeps_the_name_and_is_cleared_by_a_rename()
    {
        var admin = await AdminAsync();
        var clinic = await Data.Clinic();
        var owner = await Login.OwnerAsync(clinic);
        const string arabic = "زوكالين";
        var drug = await Data.SharedDrug().Named(DrugName("ZUKALIN")).WithIngredients("ZUKALIN HCL");
        // Set the hidden Arabic name as the load script does (its own row, both columns)
        await App.OutsideTheApp.ExecuteAsync(@"UPDATE ""Drugs"" SET ""NameAr"" = @p0, ""SearchOther"" = @p1 WHERE ""Id"" = @p2",
            arabic, SearchText.OtherText(arabic, "ZUKALIN HCL"), drug.Id);
        var bodies = new List<string>();
        (await admin.SearchAdminDrugsAsync(arabic)).Items.Select(d => d.Id).ShouldBe([drug.Id]);

        var keep = await admin.PutAsync(AdminDrug(drug.Id), SharedDrugBody(drug.Name, "ZUKALIN HCL", "Only the description"));

        bodies.Add(await keep.ShouldBeOkAsync());
        bodies.Add(await (await admin.GetAsync($"{AdminDrugs}?search={Uri.EscapeDataString(arabic)}")).ShouldBeOkAsync());
        (await admin.SearchAdminDrugsAsync(arabic)).Items.Select(d => d.Id).ShouldBe([drug.Id]);
        (await owner.SearchClinicDrugsAsync(arabic)).Items.Select(d => d.Id).ShouldBe([drug.Id]);
        bodies.Add(await (await owner.GetAsync(ClinicDrug(drug.Id))).ShouldBeOkAsync());
        var newName = DrugName("ZUKALINNEW");

        var rename = await admin.PutAsync(AdminDrug(drug.Id), SharedDrugBody(newName, "ZUKALIN HCL", "Only the description"));

        bodies.Add(await rename.ShouldBeOkAsync());
        (await admin.SearchAdminDrugsAsync(arabic)).TotalCount.ShouldBe(0);
        (await owner.SearchClinicDrugsAsync(arabic)).TotalCount.ShouldBe(0);
        (await admin.SearchAdminDrugsAsync(newName)).Items.Select(d => d.Id).ShouldBe([drug.Id]);
        (await owner.SearchClinicDrugsAsync(newName)).Items.Select(d => d.Id).ShouldBe([drug.Id]);
        bodies.Add(await (await admin.GetAsync(AdminDrug(drug.Id))).ShouldBeOkAsync());
        bodies.Add(await (await admin.GetAsync($"{AdminDrugs}?search={Uri.EscapeDataString(newName)}")).ShouldBeOkAsync());
        (await App.QueryDbAsync(db => db.Drugs.IgnoreQueryFilters().Where(d => d.Id == drug.Id).Select(d => d.NameAr).SingleAsync()))
            .ShouldBeNull();
        foreach (var body in bodies)
        {
            Readable(body).ShouldNotContain(arabic);
            ShouldHaveNoDrugNameAr(JsonNode.Parse(body));
        }
    }

    /// <summary>No drug object (one with a <c>name</c>) anywhere in the body carries <c>nameAr</c>.</summary>
    private static void ShouldHaveNoDrugNameAr(JsonNode node)
    {
        switch (node)
        {
            case JsonObject json:
                if (json.ContainsKey("name"))
                    json.ContainsKey("nameAr").ShouldBeFalse(json.ToJsonString());
                foreach (var (_, value) in json)
                    ShouldHaveNoDrugNameAr(value);
                break;
            case JsonArray array:
                foreach (var item in array)
                    ShouldHaveNoDrugNameAr(item);
                break;
        }
    }

    private static async Task<ProtocolDto> ReadProtocolAsync(ApiClient client, int id) =>
        await (await client.GetAsync(Protocol(id))).ReadAsync<ProtocolDto>();

    private static string Json(ProtocolDto protocol) =>
        System.Text.Json.JsonSerializer.Serialize(protocol.Items.Select(i => new { i.Drug.Id, i.Dosing }), Harness.Assertions.Json.Options);
}
