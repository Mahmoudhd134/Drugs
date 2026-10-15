using System.Net;
using ClinicHub.Application.Common.Paging;
using ClinicHub.Application.Features.Platform.Clinics;
using ClinicHub.IntegrationTests.Harness.Assertions;
using ClinicHub.IntegrationTests.Harness.Builders;
using ClinicHub.IntegrationTests.Harness.Hosting;
using Microsoft.EntityFrameworkCore;
using Shouldly;

namespace ClinicHub.IntegrationTests.Admin;

/// <summary>
/// <c>GET /admin/clinics</c> (platform-admin tech "API"): no template, no deleted clinics; <c>search</c> case-insensitive
/// contains, names starting with it first, then by name and id; <c>status</c> trimmed, lower-cased, control characters
/// dropped, any other value matches nothing. Each test names its clinics with its own token and searches for it, so
/// the other tests' clinics never show.
/// </summary>
[Collection(AdminCollection2.Name)]
[Trait("Area", "admin")]
public class ClinicListTests(AppFixture app) : IntegrationTest(app)
{
    private static string Token() => $"Lst{Unique.Next()}q";

    [Fact]
    [Trait("Case", "ADM-016")]
    [Trait("Tier", "Smoke")]
    public async Task The_list_holds_the_active_and_suspended_clinics_but_never_the_template_or_a_deleted_one()
    {
        var admin = await Login.SharedSuperAdminAsync();
        var a = await Data.Clinic();
        var b = await Data.Clinic().Suspended();
        var c = await Data.Clinic().Deleted();
        var templateId = await App.TemplateClinicIdAsync();

        var page = await admin.ListClinicsAsync("pageSize=100");

        var ids = page.Items.Select(x => x.Id).ToList();
        ids.ShouldContain(a.Id);
        ids.ShouldContain(b.Id);
        ids.ShouldNotContain(c.Id);
        ids.ShouldNotContain(templateId);
        page.TotalCount.ShouldBe(await App.QueryDbAsync(db => db.Clinics.CountAsync(x => !x.IsTemplate && x.DeletedAt == null)));
    }

    [Fact]
    [Trait("Case", "ADM-017")]
    public async Task A_summary_has_id_name_status_active_staff_count_and_creation_date()
    {
        var admin = await Login.SharedSuperAdminAsync();
        var token = Token();
        var a = await Data.Clinic().Named($"{token} A");
        await Data.Staff(a);
        await Data.Staff(a).Inactive();

        var response = await admin.GetAsync($"{AdminRoutes.Clinics}?search={token}");

        await response.ShouldBeOkAsync();
        var item = (await response.ReadNodeAsync())["items"]!.AsArray().ShouldHaveSingleItem()!.AsObject();
        item.Select(p => p.Key).OrderBy(k => k).ShouldBe(["createdAt", "id", "name", "staffCount", "status"]);
        var summary = (await response.ReadAsync<PagedResult<ClinicSummary>>()).Items.Single();
        summary.Id.ShouldBe(a.Id);
        summary.Name.ShouldBe(a.Name);
        summary.Status.ShouldBe("active");
        summary.StaffCount.ShouldBe(2, "the owner and the active staff member; the inactive one is not counted");
    }

    [Fact]
    [Trait("Case", "ADM-018")]
    public async Task Search_is_case_insensitive_contains_with_names_starting_with_the_term_first()
    {
        var admin = await Login.SharedSuperAdminAsync();
        var n = Unique.Next();
        var second = await Data.Clinic().Named($"Second demo{n} clinic");
        // Contains the term only, and comes before "Demo…" by name: listed after it, the prefix match ranks first
        var containsOnly = await Data.Clinic().Named($"A demo{n} clinic");
        var demo = await Data.Clinic().Named($"Demo{n} clinic");

        (await admin.SearchClinicIdsAsync($"DEMO{n}")).ShouldBe([demo.Id, containsOnly.Id, second.Id]);
    }

    [Fact]
    public async Task Search_lists_the_names_starting_with_the_term_first_then_the_others_by_name()
    {
        // Ported from accept-api.py "clinics list"
        var admin = await Login.SharedSuperAdminAsync();
        var token = Token();
        var zeta = await Data.Clinic().Named($"Zeta {token} one");
        var alpha = await Data.Clinic().Named($"{token} Alpha");
        var beta = await Data.Clinic().Named($"Beta {token}");
        var target = await Data.Clinic().Named($"{token} Auth target");

        (await admin.SearchClinicIdsAsync(token)).ShouldBe([alpha.Id, target.Id, beta.Id, zeta.Id]);
        (await admin.SearchClinicIdsAsync(token.ToUpperInvariant())).ShouldBe([alpha.Id, target.Id, beta.Id, zeta.Id]);
    }

    [Fact]
    [Trait("Case", "ADM-019")]
    public async Task Clinics_with_the_same_name_are_ordered_by_id()
    {
        var admin = await Login.SharedSuperAdminAsync();
        var name = $"Same {Token()}";
        var first = await Data.Clinic().Named(name);
        var second = await Data.Clinic().Named(name);
        var third = await Data.Clinic().Named(name);

        (await admin.SearchClinicIdsAsync(name)).ShouldBe([first.Id, second.Id, third.Id]);
    }

    [Fact]
    [Trait("Case", "ADM-020")]
    public async Task The_status_filter_lists_only_the_clinics_with_that_status()
    {
        var admin = await Login.SharedSuperAdminAsync();
        var token = Token();
        var a = await Data.Clinic().Named($"{token} A");
        var b = await Data.Clinic().Named($"{token} B").Suspended();

        (await admin.SearchClinicIdsAsync(token, "&status=suspended")).ShouldBe([b.Id]);
        (await admin.SearchClinicIdsAsync(token, "&status=active")).ShouldBe([a.Id]);
        (await admin.SearchClinicIdsAsync(token)).ShouldBe([a.Id, b.Id]);
    }

    [Fact]
    [Trait("Case", "ADM-021")]
    public async Task The_status_is_trimmed_and_lower_cased()
    {
        var admin = await Login.SharedSuperAdminAsync();
        var token = Token();
        await Data.Clinic().Named($"{token} A");
        var b = await Data.Clinic().Named($"{token} B").Suspended();

        (await admin.SearchClinicIdsAsync(token, "&status=%20Suspended%20")).ShouldBe([b.Id]);
        (await admin.SearchClinicIdsAsync(token, "&status=%20SUSPENDED%20")).ShouldBe([b.Id]);
    }

    [Fact]
    public async Task Control_characters_are_dropped_from_the_status_and_other_values_match_nothing()
    {
        // Ported from accept-api.py "clinics list" (status=sus%00pended, deleted; status=%00 alone is not settled by the docs)
        var admin = await Login.SharedSuperAdminAsync();
        var token = Token();
        await Data.Clinic().Named($"{token} A");
        var b = await Data.Clinic().Named($"{token} B").Suspended();
        await Data.Clinic().Named($"{token} C").Deleted();

        (await admin.SearchClinicIdsAsync(token, "&status=sus%00pended")).ShouldBe([b.Id]);
        (await admin.SearchClinicIdsAsync(token, "&status=deleted")).ShouldBeEmpty();
    }

    [Fact]
    [Trait("Case", "ADM-022")]
    public async Task An_unknown_status_answers_200_with_an_empty_page()
    {
        var admin = await Login.SharedSuperAdminAsync();
        await Data.Clinic();
        await Data.Clinic().Suspended();

        var page = await admin.ListClinicsAsync("status=foo");

        page.Items.ShouldBeEmpty();
        page.TotalCount.ShouldBe(0);
    }

    [Fact]
    [Trait("Case", "ADM-023")]
    public async Task A_control_character_in_the_search_is_dropped()
    {
        var admin = await Login.SharedSuperAdminAsync();
        var n = Unique.Next();
        var demo = await Data.Clinic().Named($"Demo{n} clinic");
        var second = await Data.Clinic().Named($"Second demo{n} clinic");

        var all = await admin.ListClinicsAsync("pageSize=100");
        var nul = await admin.ListClinicsAsync("search=%00&pageSize=100");
        nul.TotalCount.ShouldBe(all.TotalCount);
        nul.Items.Select(c => c.Id).ShouldBe(all.Items.Select(c => c.Id));
        (await admin.ListClinicsAsync($"search=demo{n}%00")).Items.Select(c => c.Id).ShouldBe([demo.Id, second.Id]);
        await (await admin.GetAsync($"{AdminRoutes.Clinics}?search=x%00y")).ShouldBeOkAsync();
    }

    [Fact]
    [Trait("Case", "ADM-025")]
    public async Task A_deleted_clinic_is_never_found_whatever_the_status_filter()
    {
        var admin = await Login.SharedSuperAdminAsync();
        var name = $"Gone {Token()}";
        await Data.Clinic().Named(name).Suspended().Deleted();
        await Data.Clinic().Named(name).Deleted();

        foreach (var status in new[] { "", "&status=active", "&status=suspended" })
            (await admin.SearchClinicIdsAsync(name, status)).ShouldBeEmpty(status);
    }

    [Fact]
    [Trait("Case", "ADM-030")]
    public async Task The_total_count_counts_the_filtered_list()
    {
        var admin = await Login.SharedSuperAdminAsync();
        var token = Token();
        await Data.Clinic().Named($"{token} A");
        await Data.Clinic().Named($"{token} B").Suspended();
        await Data.Clinic().Named($"{token} C").Suspended();
        await Data.Clinic().Named($"Other {Token()}").Suspended();

        var page = await admin.ListClinicsAsync($"search={token}&status=suspended&pageSize=1");

        page.TotalCount.ShouldBe(2);
        page.Items.Count.ShouldBe(1);
        (await admin.ListClinicsAsync($"search={token}")).TotalCount.ShouldBe(3);
    }
}

/// <summary>Paging of the clinics list (<c>Paging.Normalize</c>: page ≥ 1, pageSize 1–100, default 20) on exactly 25 clinics.</summary>
[Collection(AdminCollection2.Name)]
[Trait("Area", "admin")]
public class ClinicListPagingTests(AppFixture app) : IntegrationTest(app)
{
    // No test of this class adds a clinic: the list holds exactly these 25
    private Task<List<int>> ClinicsAsync() => App.PerClassAsync("clinics", async () =>
    {
        var ids = new List<int>();
        for (var i = 0; i < 25; i++)
            ids.Add((await Data.Clinic().Named($"Paged {i:D2} عيادة")).Id);
        return ids;
    });

    [Fact]
    [Trait("Case", "ADM-026")]
    public async Task Without_paging_parameters_the_first_page_of_20_is_answered_with_the_total()
    {
        var ids = await ClinicsAsync();
        var admin = await Login.SharedSuperAdminAsync();

        var page = await admin.ListClinicsAsync();

        page.Page.ShouldBe(1);
        page.PageSize.ShouldBe(20);
        page.TotalCount.ShouldBe(25);
        page.Items.Select(c => c.Id).ShouldBe(ids.Take(20));
    }

    [Fact]
    [Trait("Case", "ADM-027")]
    public async Task The_page_size_is_capped_at_100()
    {
        await ClinicsAsync();
        var admin = await Login.SharedSuperAdminAsync();

        var hundred = await admin.ListClinicsAsync("pageSize=100");
        hundred.PageSize.ShouldBe(100);
        hundred.Items.Count.ShouldBe(25);
        (await admin.ListClinicsAsync("pageSize=101")).PageSize.ShouldBe(100);
        (await admin.ListClinicsAsync("pageSize=1000")).PageSize.ShouldBe(100);
    }

    [Fact]
    [Trait("Case", "ADM-028")]
    public async Task A_page_size_below_1_becomes_1_and_a_page_below_1_becomes_page_1()
    {
        var ids = await ClinicsAsync();
        var admin = await Login.SharedSuperAdminAsync();

        (await admin.ListClinicsAsync("pageSize=1")).Items.Select(c => c.Id).ShouldBe([ids[0]]);
        (await admin.ListClinicsAsync("pageSize=1&page=2")).Items.Select(c => c.Id).ShouldBe([ids[1]]);
        foreach (var size in new[] { "0", "-5" })
        {
            var page = await admin.ListClinicsAsync($"pageSize={size}");
            page.PageSize.ShouldBe(1);
            page.Items.Count.ShouldBe(1);
        }
        foreach (var number in new[] { "0", "-1", "-3" })
        {
            var page = await admin.ListClinicsAsync($"page={number}");
            page.Page.ShouldBe(1);
            page.Items.Select(c => c.Id).ShouldBe(ids.Take(20));
        }
    }

    [Fact]
    [Trait("Case", "ADM-029")]
    public async Task The_largest_page_number_answers_an_empty_page_without_overflow()
    {
        await ClinicsAsync();
        var admin = await Login.SharedSuperAdminAsync();

        var response = await admin.GetAsync($"{AdminRoutes.Clinics}?page=2147483647&pageSize=100");

        await response.ShouldBeOkAsync();
        var page = await response.ReadAsync<PagedResult<ClinicSummary>>();
        page.Items.ShouldBeEmpty();
        page.TotalCount.ShouldBe(25);
    }
}

/// <summary>
/// The Arabic-normalized clinic search (platform-admin business "القواعد التشغيلية": أ إ آ ا, ى ي, ة ه folded, names shown
/// as written).
/// </summary>
[Collection(AdminCollection2.Name)]
[Trait("Area", "admin")]
public class ClinicArabicSearchTests(AppFixture app) : IntegrationTest(app)
{
    [Fact]
    [Trait("Case", "ADM-024")]
    public async Task An_alef_with_hamza_is_found_by_a_plain_alef()
    {
        var admin = await Login.SharedSuperAdminAsync();
        var ahmed = await Data.Clinic().Named("عيادة أحمد");

        var found = (await admin.ListClinicsAsync($"search={Uri.EscapeDataString("احمد")}&pageSize=100")).Items;

        found.ShouldContain(c => c.Id == ahmed.Id && c.Name == "عيادة أحمد");
    }

    [Fact]
    [Trait("Case", "ADM-287")]
    public async Task Hamza_yaa_and_taa_marbuta_are_folded_in_both_directions()
    {
        var admin = await Login.SharedSuperAdminAsync();
        var ahmed = await Data.Clinic().Named("عيادة احمد");
        var nour = await Data.Clinic().Named("مستشفى النور");

        var byHamza = await admin.SearchClinicIdsAsync("أحمد");
        byHamza.ShouldContain(ahmed.Id);
        byHamza.ShouldNotContain(nour.Id);
        var byYaa = await admin.SearchClinicIdsAsync("مستشفي");
        byYaa.ShouldContain(nour.Id);
        byYaa.ShouldNotContain(ahmed.Id);
        var byHaa = await admin.SearchClinicIdsAsync("عياده");
        byHaa.ShouldContain(ahmed.Id);
        byHaa.ShouldNotContain(nour.Id);
    }

    [Fact]
    [Trait("Case", "ADM-288")]
    public async Task Names_starting_with_the_folded_term_come_first()
    {
        var admin = await Login.SharedSuperAdminAsync();
        var center = await Data.Clinic().Named("مركز الأمل");
        // Contains the folded term only, and comes before «أمل» by name (Latin first): the folded prefix ranks «أمل» first
        var containsOnly = await Data.Clinic().Named("A الأمل");
        var amal = await Data.Clinic().Named("أمل");

        (await admin.SearchClinicIdsAsync("امل")).ShouldBe([amal.Id, containsOnly.Id, center.Id]);
    }
}
