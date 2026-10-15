using System.Net;
using ClinicHub.Application.Features.Platform.Clinics;
using ClinicHub.IntegrationTests.Harness.Assertions;
using ClinicHub.IntegrationTests.Harness.Builders;
using ClinicHub.IntegrationTests.Harness.Clients;
using ClinicHub.IntegrationTests.Harness.Hosting;
using Shouldly;

namespace ClinicHub.IntegrationTests.Admin;

/// <summary>
/// <c>POST /admin/clinics</c> validation (platform-admin tech "API"; design M1.5 § 7 errors; business "القواعد
/// التشغيلية": names required, ≤ 256, no control or bidi characters; the owner's phone valid, local numbers accepted).
/// </summary>
[Collection(AdminCollection3.Name)]
[Trait("Area", "admin")]
public class CreateClinicValidationTests(AppFixture app) : IntegrationTest(app)
{
    private static object Body(string name, string phone, string fullName) => new { name, owner = new { phone, fullName } };

    private static object ValidOwner() => new { phone = Unique.Phone(), fullName = "Valid Owner" };

    private async Task<Problem> CreateRefusedAsync(ApiClient admin, object body, string code)
    {
        var before = await App.RowCountsAsync();
        var problem = await (await admin.PostAsync(AdminRoutes.Clinics, body)).ShouldBeProblemAsync(HttpStatusCode.BadRequest, code);
        (await App.RowCountsAsync()).ShouldBe(before, "a refused create writes nothing");
        return problem;
    }

    private static async Task<ClinicDetails> CreatedAsync(ApiClient admin, object body)
    {
        var response = await admin.PostAsync(AdminRoutes.Clinics, body);
        await response.ShouldBeAsync(HttpStatusCode.Created);
        return await response.ReadAsync<ClinicDetails>();
    }

    [Fact]
    [Trait("Case", "ADM-046")]
    public async Task A_blank_name_is_refused_with_nameRequired_on_name()
    {
        var admin = await Login.SharedSuperAdminAsync();

        var problem = await CreateRefusedAsync(admin, new { name = "   ", owner = ValidOwner() }, "nameRequired");

        problem.Errors.ShouldHaveSingleItem().Field.ShouldBe("name");
    }

    [Theory]
    [Trait("Case", "ADM-047")]
    [InlineData("\u200B \u2060\uFEFF")]
    [InlineData("\u200B")]
    public async Task A_name_of_invisible_format_characters_only_is_refused_with_nameRequired(string name)
    {
        var admin = await Login.SharedSuperAdminAsync();

        (await CreateRefusedAsync(admin, new { name, owner = ValidOwner() }, "nameRequired")).ShouldHaveError("name", "nameRequired");
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("  \t ")]
    [InlineData("\u200E")]
    public async Task A_null_empty_tab_or_mark_only_name_is_refused_with_nameRequired(string name)
    {
        // Ported from accept-api.py "create clinic" / "clinics get/rename" (null, empty, tab only, LRM only)
        var admin = await Login.SharedSuperAdminAsync();

        (await CreateRefusedAsync(admin, new { name, owner = ValidOwner() }, "nameRequired")).ShouldHaveError("name", "nameRequired");
    }

    [Fact]
    [Trait("Case", "ADM-048")]
    public async Task A_name_of_256_characters_is_accepted_and_257_is_refused_with_nameTooLong()
    {
        var admin = await Login.SharedSuperAdminAsync();
        var name256 = $"{Unique.Next()} ".PadRight(256, 'n');

        (await CreatedAsync(admin, new { name = name256, owner = ValidOwner() })).Name.ShouldBe(name256);
        (await CreateRefusedAsync(admin, new { name = name256 + "n", owner = ValidOwner() }, "nameTooLong"))
            .ShouldHaveError("name", "nameTooLong");
    }

    [Theory]
    [Trait("Case", "ADM-049")]
    [InlineData("Bad\u0000name")]
    [InlineData("Two\nlines")]
    [InlineData("Line\u2028separator")]
    [InlineData("Paragraph\u2029separator")]
    public async Task A_NUL_an_inner_line_break_or_a_line_or_paragraph_separator_is_refused_with_nameInvalid(string name)
    {
        var admin = await Login.SharedSuperAdminAsync();

        (await CreateRefusedAsync(admin, new { name, owner = ValidOwner() }, "nameInvalid")).ShouldHaveError("name", "nameInvalid");
    }

    [Fact]
    [Trait("Case", "ADM-049")]
    public async Task A_trailing_line_break_is_trimmed()
    {
        var admin = await Login.SharedSuperAdminAsync();
        var name = $"Trailing {Unique.Next()}";

        (await CreatedAsync(admin, new { name = name + "\n", owner = ValidOwner() })).Name.ShouldBe(name);
    }

    [Theory]
    [Trait("Case", "ADM-050")]
    [InlineData("\u202E")]
    [InlineData("\u202A")]
    [InlineData("\u202B")]
    [InlineData("\u202C")]
    [InlineData("\u202D")]
    [InlineData("\u2066")]
    [InlineData("\u2067")]
    [InlineData("\u2068")]
    [InlineData("\u2069")]
    public async Task A_bidi_override_embedding_or_isolate_is_refused_with_nameInvalid(string bidi)
    {
        var admin = await Login.SharedSuperAdminAsync();

        (await CreateRefusedAsync(admin, new { name = $"Clinic{bidi}name", owner = ValidOwner() }, "nameInvalid"))
            .ShouldHaveError("name", "nameInvalid");
    }

    [Theory]
    [Trait("Case", "ADM-051")]
    [InlineData("Family \U0001F468\u200D\U0001F469\u200D\U0001F467 clinic")]
    [InlineData("Zero\u200Cwidth")]
    [InlineData("Mark\u200Eleft")]
    [InlineData("Mark\u200Fright")]
    [InlineData("عيادة\u061Cالنور")]
    public async Task Joiners_and_direction_marks_are_allowed(string name)
    {
        var admin = await Login.SharedSuperAdminAsync();

        (await CreatedAsync(admin, new { name, owner = ValidOwner() })).Name.ShouldBe(name);
    }

    [Fact]
    [Trait("Case", "ADM-052")]
    public async Task Arabic_clinic_and_owner_names_are_stored_as_typed_trimmed()
    {
        var admin = await Login.SharedSuperAdminAsync();

        var created = await CreatedAsync(admin, Body("  عيادة النور  ", Unique.Phone(), " سارة أحمد "));

        created.Name.ShouldBe("عيادة النور");
        created.Owners.ShouldHaveSingleItem().FullName.ShouldBe("سارة أحمد");
        var stored = await admin.ClinicAsync(created.Id);
        stored.Name.ShouldBe("عيادة النور");
        stored.Owners.Single().FullName.ShouldBe("سارة أحمد");
    }

    [Fact]
    [Trait("Case", "ADM-053")]
    public async Task The_owner_name_follows_the_name_rules_on_owner_fullName()
    {
        var admin = await Login.SharedSuperAdminAsync();

        (await CreateRefusedAsync(admin, Body("N", Unique.Phone(), "  "), "nameRequired")).ShouldHaveError("owner.fullName", "nameRequired");
        var name256 = $"{Unique.Next()} ".PadRight(256, 'o');
        (await CreatedAsync(admin, Body($"Clinic {Unique.Next()}", Unique.Phone(), name256))).Owners.Single().FullName.ShouldBe(name256);
        (await CreateRefusedAsync(admin, Body("N", Unique.Phone(), name256 + "o"), "nameTooLong")).ShouldHaveError("owner.fullName", "nameTooLong");
        (await CreateRefusedAsync(admin, Body("N", Unique.Phone(), "Owner\u202Ename"), "nameInvalid")).ShouldHaveError("owner.fullName", "nameInvalid");
        // Ported: an inner U+2028 in the owner name (accept-api.py)
        (await CreateRefusedAsync(admin, Body("N", Unique.Phone(), "Owner\u2028name"), "nameInvalid")).ShouldHaveError("owner.fullName", "nameInvalid");
    }

    [Theory]
    [Trait("Case", "ADM-054")]
    [InlineData("123")]
    [InlineData(null)]
    public async Task An_invalid_or_missing_owner_phone_is_refused_with_invalidPhone(string phone)
    {
        var admin = await Login.SharedSuperAdminAsync();

        (await CreateRefusedAsync(admin, Body("N", phone, "O"), "invalidPhone")).ShouldHaveError("owner.phone", "invalidPhone");
    }

    [Fact]
    public async Task An_owner_without_a_phone_or_with_letters_is_refused_with_invalidPhone()
    {
        // Ported from accept-api.py "create clinic" (phone missing, phone letters)
        var admin = await Login.SharedSuperAdminAsync();

        (await CreateRefusedAsync(admin, new { name = "N", owner = new { fullName = "O" } }, "invalidPhone"))
            .ShouldHaveError("owner.phone", "invalidPhone");
        (await CreateRefusedAsync(admin, Body("N", "01abc", "O"), "invalidPhone")).ShouldHaveError("owner.phone", "invalidPhone");
    }

    [Theory]
    [Trait("Case", "ADM-055")]
    [InlineData("01000000050")]
    [InlineData("+201000000050")]
    [InlineData("00201000000050")]
    [InlineData("+20 100 000 0050")]
    public async Task Any_phone_format_is_stored_in_E164(string phone)
    {
        var admin = await Login.SharedSuperAdminAsync();

        var created = await CreatedAsync(admin, Body($"Clinic {Unique.Next()}", phone, "Owner"));

        created.Owners.ShouldHaveSingleItem().Phone.ShouldBe("+201000000050");
    }

    [Fact]
    [Trait("Case", "ADM-056")]
    public async Task Arabic_Indic_digits_are_accepted_for_the_owner_and_for_a_new_staff_member()
    {
        var admin = await Login.SharedSuperAdminAsync();

        var created = await CreatedAsync(admin, Body($"Clinic {Unique.Next()}", "٠١٠٠٠٠٠٠٠٥٠", "Owner"));
        created.Owners.ShouldHaveSingleItem().Phone.ShouldBe("+201000000050");

        var other = await Data.Clinic();
        var response = await admin.PostAsync(AdminRoutes.Staff(other.Id),
            new { phone = "٠١٠٠٠٠٠٠٠٥١", fullName = "Arabic digits", roleIds = new[] { other.RoleId("Doctor") } });
        await response.ShouldBeAsync(HttpStatusCode.Created);
        (await response.ReadAsync<ClinicHub.Application.Features.Access.StaffMembers.StaffMemberDto>()).Phone.ShouldBe("+201000000051");
    }

    [Fact]
    [Trait("Case", "ADM-057")]
    public async Task A_body_without_an_owner_is_refused_with_invalidRequest_on_owner()
    {
        var admin = await Login.SharedSuperAdminAsync();

        (await CreateRefusedAsync(admin, new { name = "N" }, "invalidRequest")).ShouldHaveError("owner", "invalidRequest");
        (await CreateRefusedAsync(admin, new { name = "N", owner = (object)null }, "invalidRequest")).ShouldHaveError("owner", "invalidRequest");
    }

    [Fact]
    [Trait("Case", "ADM-058")]
    public async Task Every_error_is_returned_in_the_forms_order()
    {
        var admin = await Login.SharedSuperAdminAsync();

        var problem = await CreateRefusedAsync(admin, Body("", "123", ""), "nameRequired");

        problem.Errors.Select(e => (e.Code, e.Field)).ShouldBe(
            [("nameRequired", "name"), ("invalidPhone", "owner.phone"), ("nameRequired", "owner.fullName")]);
    }

    [Fact]
    [Trait("Case", "ADM-059")]
    public async Task No_row_of_any_kind_is_added_by_a_refused_create()
    {
        var admin = await Login.SharedSuperAdminAsync();
        await TemplateCatalog.CreateAsync(App);
        var before = await App.RowCountsAsync();
        var users = await App.UserCountAsync();
        var refused = new (object Body, string Code)[]
        {
            (Body("  ", Unique.Phone(), "O"), "nameRequired"),
            (Body(new string('x', 257), Unique.Phone(), "O"), "nameTooLong"),
            (Body("Bad\u202Ename", Unique.Phone(), "O"), "nameInvalid"),
            (Body("N", "123", "O"), "invalidPhone"),
            (Body("N", Unique.Phone(), ""), "nameRequired"),
            (new { name = "N" }, "invalidRequest"),
            (Body("", "1", ""), "nameRequired"),
        };

        foreach (var (body, code) in refused)
            await (await admin.PostAsync(AdminRoutes.Clinics, body)).ShouldBeProblemAsync(HttpStatusCode.BadRequest, code);

        (await App.RowCountsAsync()).ShouldBe(before);
        (await App.UserCountAsync()).ShouldBe(users);
    }

    [Fact]
    public async Task Malformed_JSON_is_refused_with_invalidRequest()
    {
        // Ported from accept-api.py "create clinic"
        var admin = await Login.SharedSuperAdminAsync();
        var before = await App.RowCountsAsync();

        await (await admin.SendRawAsync(HttpMethod.Post, AdminRoutes.Clinics, "{bad")).ShouldBeProblemAsync(HttpStatusCode.BadRequest, "invalidRequest");

        (await App.RowCountsAsync()).ShouldBe(before);
    }

    [Fact]
    [Trait("Case", "ADM-285")]
    public async Task A_landline_owner_phone_is_accepted()
    {
        var admin = await Login.SharedSuperAdminAsync();

        var created = await CreatedAsync(admin, Body($"Clinic {Unique.Next()}", "0223456789", "Owner"));

        created.Owners.ShouldHaveSingleItem().Phone.ShouldBe("+20223456789");
    }
}
