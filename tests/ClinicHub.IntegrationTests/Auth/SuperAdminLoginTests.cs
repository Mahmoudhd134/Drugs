using System.Net;
using System.Text.Json.Nodes;
using ClinicHub.Application.Features.Identity.Sessions;
using ClinicHub.IntegrationTests.Harness.Assertions;
using ClinicHub.IntegrationTests.Harness.Hosting;
using Shouldly;

namespace ClinicHub.IntegrationTests.Auth;

/// <summary>The test super admin (no clinic membership in this class): contexts, tokens and the 12 h session.</summary>
[Collection(AuthCollection3.Name)]
[Trait("Area", "auth")]
public class SuperAdminLoginTests(AppFixture app) : IntegrationTest(app)
{
    [Fact]
    [Trait("Case", "AUTH-084")]
    public async Task A_super_admin_without_clinics_gets_the_template_and_the_platform_and_no_context()
    {
        var templateId = await App.TemplateClinicIdAsync();
        var browser = Anonymous();
        var code = await Login.CodeAsync(browser, Login.SuperAdminPhone);

        var response = await browser.VerifyOtpAsync(Login.SuperAdminPhone, code);

        await response.ShouldBeOkAsync();
        var body = (await response.ReadNodeAsync()).AsObject();
        body["context"].ShouldBeNull();
        var contexts = body["contexts"]!.AsArray();
        contexts.Count.ShouldBe(2);
        var template = contexts[0]!.AsObject();
        template["type"]!.GetValue<string>().ShouldBe("clinic");
        template["clinicId"]!.GetValue<int>().ShouldBe(templateId);
        template["isTemplate"]!.GetValue<bool>().ShouldBeTrue();
        template["roles"]!.AsArray().Count.ShouldBe(0);
        var platform = contexts[1]!.AsObject();
        platform.Select(p => p.Key).ShouldBe(new[] { "type" });
        platform["type"]!.GetValue<string>().ShouldBe("platform");
    }

    [Fact]
    [Trait("Case", "AUTH-039")]
    public async Task A_super_admin_session_lasts_12_hours_even_before_a_context_is_chosen()
    {
        var browser = Anonymous();
        var code = await Login.CodeAsync(browser, Login.SuperAdminPhone);

        var response = await browser.VerifyOtpAsync(Login.SuperAdminPhone, code);

        await response.ShouldBeOkAsync();
        browser.Auth.Context.ShouldBeNull();
        response.ShouldSetRefreshCookie().Expires.ShouldBe(Clock.GetUtcNow().AddHours(12));
        (await App.SessionOfAsync(browser.AccessToken)).ExpiresAt.ShouldBe(Clock.GetUtcNow().UtcDateTime.AddHours(12));
    }

    [Fact]
    [Trait("Case", "AUTH-041")]
    public async Task A_platform_token_says_platform_and_super_admin_and_has_no_clinic()
    {
        var admin = await Login.SuperAdminAsync();

        var claims = AuthKit.Claims(admin.AccessToken);
        claims.Claim("ctx").ShouldBe("platform");
        claims.Claim("super_admin").ShouldBe("true");
        claims.Has("clinic_id").ShouldBeFalse();
        claims.Has("staff_id").ShouldBeFalse();
        admin.Auth.Context.ShouldBe(ContextDto.Platform);
    }

    [Fact]
    [Trait("Case", "AUTH-042")]
    public async Task A_template_token_is_a_clinic_token_of_the_template_without_staff()
    {
        var templateId = await App.TemplateClinicIdAsync();

        var admin = await Login.SuperAdminInTemplateAsync();

        var claims = AuthKit.Claims(admin.AccessToken);
        claims.Claim("ctx").ShouldBe("clinic");
        claims.Claim("clinic_id").ShouldBe(templateId.ToString());
        claims.Has("staff_id").ShouldBeFalse();
        claims.Has("super_admin").ShouldBeFalse();
        admin.Auth.Context.IsTemplate.ShouldBe(true);
    }

    [Fact]
    [Trait("Case", "AUTH-135")]
    public async Task A_super_admin_switches_to_the_platform()
    {
        var browser = await Login.AsAsync(Login.SuperAdminPhone);

        var response = await browser.SwitchContextAsync("platform");

        await response.ShouldBeOkAsync();
        browser.Auth.Context.Type.ShouldBe("platform");
        AuthKit.Claims(browser.AccessToken).Claim("ctx").ShouldBe("platform");
        response.ShouldSetRefreshCookie();
    }

    [Fact]
    [Trait("Case", "AUTH-136")]
    public async Task A_super_admin_switches_to_the_template()
    {
        var templateId = await App.TemplateClinicIdAsync();
        var browser = await Login.AsAsync(Login.SuperAdminPhone);

        var response = await browser.SwitchContextAsync("clinic", templateId);

        await response.ShouldBeOkAsync();
        browser.Auth.Context.ClinicId.ShouldBe(templateId);
        browser.Auth.Context.IsTemplate.ShouldBe(true);
        browser.Auth.Context.Roles.ShouldBeEmpty();
    }

    [Fact]
    [Trait("Case", "AUTH-115")]
    public async Task A_super_admin_without_clinics_lists_the_template_then_the_platform()
    {
        var templateId = await App.TemplateClinicIdAsync();
        var admin = await Login.SuperAdminAsync();

        var response = await admin.GetAsync("/api/v1/auth/contexts");

        var contexts = await response.ReadAsync<List<ContextDto>>();
        contexts.Select(c => (c.Type, c.ClinicId)).ShouldBe(new (string, int?)[] { ("clinic", templateId), ("platform", null) });
    }

    [Fact]
    [Trait("Case", "AUTH-101")]
    public async Task A_super_admin_session_unused_for_12_hours_has_ended_and_at_11_h_59_it_slides()
    {
        var admin = await Login.SuperAdminAsync();
        Clock.Advance(TimeSpan.FromHours(12) - TimeSpan.FromMinutes(1));

        var slid = await admin.RefreshAsync();
        await slid.ShouldBeOkAsync();
        slid.ShouldSetRefreshCookie().Expires.ShouldBe(Clock.GetUtcNow().AddHours(12));

        Clock.Advance(TimeSpan.FromHours(12));
        var ended = await admin.RefreshAsync();

        await ended.ShouldBeProblemAsync(HttpStatusCode.Unauthorized, "unauthorized");
        ended.ShouldClearRefreshCookie();
    }

    [Fact]
    [Trait("Case", "AUTH-101")]
    public async Task A_super_admin_session_in_the_template_ends_after_12_hours()
    {
        var admin = await Login.SuperAdminInTemplateAsync();

        Clock.Advance(TimeSpan.FromHours(12) + TimeSpan.FromSeconds(1));
        var response = await admin.RefreshAsync();

        await response.ShouldBeProblemAsync(HttpStatusCode.Unauthorized, "unauthorized");
        response.ShouldClearRefreshCookie();
    }
}

/// <summary>The test super admin who is also staff of a clinic (its own class: the membership stays for the class).</summary>
[Collection(AuthCollection3.Name)]
[Trait("Area", "auth")]
public class SuperAdminAsStaffTests(AppFixture app) : IntegrationTest(app)
{
    [Fact]
    [Trait("Case", "AUTH-085")]
    [Trait("Case", "AUTH-115")]
    public async Task A_super_admin_who_is_staff_has_the_clinic_then_the_template_then_the_platform_and_12_h_everywhere()
    {
        var templateId = await App.TemplateClinicIdAsync();
        var clinic = await Data.Clinic();
        await Data.Staff(clinic).WithPhone(Login.SuperAdminPhone);
        var browser = Anonymous();
        var code = await Login.CodeAsync(browser, Login.SuperAdminPhone);

        var login = await browser.VerifyOtpAsync(Login.SuperAdminPhone, code);

        await login.ShouldBeOkAsync();
        browser.Auth.Context.ShouldBeNull();
        browser.Auth.Contexts.Select(c => (c.Type, c.ClinicId))
            .ShouldBe(new (string, int?)[] { ("clinic", clinic.Id), ("clinic", templateId), ("platform", null) });
        login.ShouldSetRefreshCookie().Expires.ShouldBe(Clock.GetUtcNow().AddHours(12));
        var listed = await (await browser.GetAsync("/api/v1/auth/contexts")).ReadAsync<List<ContextDto>>();
        listed.Select(c => (c.Type, c.ClinicId))
            .ShouldBe(new (string, int?)[] { ("clinic", clinic.Id), ("clinic", templateId), ("platform", null) });

        Clock.Advance(TimeSpan.FromMinutes(5));
        var inClinic = await browser.SwitchContextAsync("clinic", clinic.Id);
        await inClinic.ShouldBeOkAsync();
        inClinic.ShouldSetRefreshCookie().Expires.ShouldBe(Clock.GetUtcNow().AddHours(12));

        Clock.Advance(TimeSpan.FromMinutes(5));
        var refreshed = await browser.RefreshAsync();
        await refreshed.ShouldBeOkAsync();
        refreshed.ShouldSetRefreshCookie().Expires.ShouldBe(Clock.GetUtcNow().AddHours(12));
        (await App.SessionOfAsync(browser.AccessToken)).ExpiresAt.ShouldBe(Clock.GetUtcNow().UtcDateTime.AddHours(12));
    }
}

/// <summary>The super admin's 12 h also holds in a clinic where they are staff (own class: the membership stays).</summary>
[Collection(AuthCollection3.Name)]
[Trait("Area", "auth")]
public class SuperAdminStaffSessionTests(AppFixture app) : IntegrationTest(app)
{
    [Fact]
    [Trait("Case", "AUTH-101")]
    public async Task A_super_admin_session_in_a_clinic_as_staff_ends_after_12_hours()
    {
        var clinic = await Data.Clinic();
        var staff = await Data.Staff(clinic).WithPhone(Login.SuperAdminPhone);
        var browser = await Login.StaffAsync(staff);
        browser.Auth.Context.ClinicId.ShouldBe(clinic.Id);

        Clock.Advance(TimeSpan.FromHours(12));
        var response = await browser.RefreshAsync();

        await response.ShouldBeProblemAsync(HttpStatusCode.Unauthorized, "unauthorized");
        response.ShouldClearRefreshCookie();
    }
}
