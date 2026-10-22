using ClinicHub.Application.Common.Search;
using ClinicHub.IntegrationTests.Harness.Assertions;
using ClinicHub.IntegrationTests.Harness.Builders;
using ClinicHub.IntegrationTests.Harness.Hosting;
using Shouldly;

namespace ClinicHub.IntegrationTests.Admin;

/// <summary>
/// The clinics' and staff's <c>SearchName</c> filled by the app (design M1.7 D7): after a rename by the super admin the
/// stored column (read by SQL) is <c>SearchText.Fold</c> of the new name, the new name is found and the old one no longer.
/// </summary>
[Collection(AdminCollection2.Name)]
[Trait("Area", "admin")]
public class AdminSearchColumnTests(AppFixture app) : IntegrationTest(app)
{
    [Fact]
    [Trait("Case", "ADM-294")]
    public async Task A_renamed_clinic_is_found_by_its_new_folded_name_and_no_longer_by_the_old_one()
    {
        var n = Unique.Next();
        var clinic = await Data.Clinic().Named($"عيادة الأمل {n}");
        var admin = await Login.SuperAdminAsync();
        var newName = $"مستشفى النور {n}";

        await (await admin.PutAsync(AdminRoutes.Clinic(clinic.Id), new { name = newName })).ShouldBeOkAsync();

        (await App.OutsideTheApp.ScalarAsync<string>("""SELECT "SearchName" FROM "Clinics" WHERE "Id" = @p0""", clinic.Id))
            .ShouldBe(SearchText.Fold(newName));
        (await admin.SearchClinicIdsAsync($"مستشفي النور {n}")).ShouldBe([clinic.Id]);
        (await admin.SearchClinicIdsAsync($"عياده الامل {n}")).ShouldBeEmpty();
    }

    [Fact]
    [Trait("Case", "ADM-295")]
    public async Task A_renamed_staff_member_is_found_by_the_new_folded_name_no_longer_by_the_old_one_and_still_by_phone()
    {
        var n = Unique.Next();
        var clinic = await Data.Clinic();
        var staff = await Data.Staff(clinic).Named($"أحمد إبراهيم {n}");
        var admin = await Login.SuperAdminAsync();
        var newName = $"مُنَى عليّ {n}";

        await (await admin.UpdateStaffAsync(clinic.Id, staff.Id, newName, true, clinic.RoleId("Doctor"))).ShouldBeOkAsync();

        (await App.OutsideTheApp.ScalarAsync<string>("""SELECT "SearchName" FROM "Staff" WHERE "Id" = @p0""", staff.Id))
            .ShouldBe(SearchText.Fold(newName));
        (await admin.SearchStaffIdsAsync(clinic.Id, $"مني علي {n}")).ShouldBe([staff.Id]);
        (await admin.SearchStaffIdsAsync(clinic.Id, $"ابراهيم {n}")).ShouldBeEmpty();
        (await admin.SearchStaffIdsAsync(clinic.Id, Unique.LocalPhone(staff.Phone))).ShouldBe([staff.Id]);
    }
}
