using System.Net;
using ClinicHub.Application.Common.Abstractions;
using ClinicHub.Application.Features.Catalog.Categories;
using ClinicHub.Domain.Catalog;
using ClinicHub.Infrastructure.Database;
using ClinicHub.IntegrationTests.Harness.Assertions;
using ClinicHub.IntegrationTests.Harness.Builders;
using ClinicHub.IntegrationTests.Harness.Databases;
using ClinicHub.IntegrationTests.Harness.Hosting;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Npgsql;
using Shouldly;

namespace ClinicHub.IntegrationTests.Isolation;

/// <summary>
/// The database guards behind the API (clinic-scoping tech § Backend, § Data model): the clinic query filter fails
/// closed, the save interceptor refuses rows without a clinic or of another clinic, and the composite foreign keys and
/// partial unique indexes reject cross-clinic links even from raw SQL. Run against the app's own DbContext and database.
/// </summary>
[Collection(IsolationCollection3.Name)]
[Trait("Area", "isolation")]
public class ClinicGuardTests(AppFixture app) : IntegrationTest(app)
{
    [Fact]
    [Trait("Case", "ISO-030")]
    public async Task Without_a_clinic_in_context_only_the_shared_drugs_and_no_clinic_owned_row_are_returned()
    {
        var clinic = await Data.Clinic();
        await Data.Protocol(clinic);

        await InClinicAsync(null, async db =>
        {
            (await db.Drugs.IgnoreQueryFilters().CountAsync(d => d.ClinicId != null)).ShouldBeGreaterThan(0);
            // Drugs: only the shared rows (design M1.7 D1)
            (await db.Drugs.CountAsync()).ShouldBe(TestRun.Baseline.SharedCount);
            (await db.Drugs.CountAsync(d => d.ClinicId != null)).ShouldBe(0);
            (await db.Protocols.CountAsync()).ShouldBe(0);
            (await db.ProtocolItems.CountAsync()).ShouldBe(0);
            (await db.Staff.CountAsync()).ShouldBe(0);
            (await db.Roles.CountAsync()).ShouldBe(0);
            (await db.StaffRoles.CountAsync()).ShouldBe(0);
        });
        await InClinicAsync(clinic.Id, async db => (await db.Drugs.CountAsync(d => d.ClinicId != null)).ShouldBeGreaterThan(0));
    }

    [Fact]
    [Trait("Case", "ISO-031")]
    public async Task Without_a_clinic_in_context_saving_a_clinic_owned_row_throws_and_writes_nothing()
    {
        var clinic = await Data.Clinic();
        var drug = await Data.Drug(clinic);
        var name = Unique.Name("Orphan", "يتيم");

        await InClinicAsync(null, async db =>
        {
            db.Drugs.Add(new Drug { Name = name, CategoryId = CategoryIds.Eye });
            await Should.ThrowAsync<InvalidOperationException>(() => db.SaveChangesAsync());
        });
        await InClinicAsync(null, async db =>
        {
            var loaded = await db.Drugs.IgnoreQueryFilters().SingleAsync(d => d.Id == drug.Id);
            loaded.Name = name;
            await Should.ThrowAsync<InvalidOperationException>(() => db.SaveChangesAsync());
        });
        await InClinicAsync(null, async db =>
        {
            db.Drugs.Remove(await db.Drugs.IgnoreQueryFilters().SingleAsync(d => d.Id == drug.Id));
            await Should.ThrowAsync<InvalidOperationException>(() => db.SaveChangesAsync());
        });

        (await App.QueryDbAsync(db => db.Drugs.IgnoreQueryFilters().CountAsync(d => d.Name == name))).ShouldBe(0);
        (await App.QueryDbAsync(db => db.Drugs.IgnoreQueryFilters().SingleAsync(d => d.Id == drug.Id))).Name.ShouldBe(drug.Name);
    }

    [Fact]
    [Trait("Case", "ISO-032")]
    public async Task In_one_clinic_adding_changing_moving_or_deleting_another_clinics_row_throws()
    {
        var a = await Data.Clinic();
        var b = await Data.Clinic();
        var bDrug = await Data.Drug(b);
        var name = Unique.Name("Intruder", "دخيل");

        await InClinicAsync(a.Id, async db =>
        {
            db.Drugs.Add(new Drug { Name = name, ClinicId = b.Id, CategoryId = CategoryIds.Eye });
            await Should.ThrowAsync<InvalidOperationException>(() => db.SaveChangesAsync());
        });
        await InClinicAsync(a.Id, async db =>
        {
            var loaded = await db.Drugs.IgnoreQueryFilters().SingleAsync(d => d.Id == bDrug.Id);
            loaded.Name = name;
            await Should.ThrowAsync<InvalidOperationException>(() => db.SaveChangesAsync());
        });
        var bProtocol = await Data.Protocol(b).With(bDrug);
        await InClinicAsync(a.Id, async db =>
        {
            // A line moved into the current clinic: refused on its original clinic
            var line = await db.ProtocolItems.IgnoreQueryFilters().SingleAsync(i => i.ProtocolId == bProtocol.Id);
            line.ClinicId = a.Id;
            await Should.ThrowAsync<InvalidOperationException>(() => db.SaveChangesAsync());
        });
        await InClinicAsync(a.Id, async db =>
        {
            db.Drugs.Remove(await db.Drugs.IgnoreQueryFilters().SingleAsync(d => d.Id == bDrug.Id));
            await Should.ThrowAsync<InvalidOperationException>(() => db.SaveChangesAsync());
        });

        var stored = await App.QueryDbAsync(db => db.Drugs.IgnoreQueryFilters().SingleAsync(d => d.Id == bDrug.Id));
        stored.Name.ShouldBe(bDrug.Name);
        stored.ClinicId.ShouldBe(b.Id);
        (await App.QueryDbAsync(db => db.Drugs.IgnoreQueryFilters().CountAsync(d => d.Name == name))).ShouldBe(0);
        (await App.QueryDbAsync(db => db.ProtocolItems.IgnoreQueryFilters().SingleAsync(i => i.ProtocolId == bProtocol.Id)))
            .ClinicId.ShouldBe(b.Id);
    }

    [Fact]
    [Trait("Case", "ISO-031")]
    public async Task Without_a_clinic_in_context_a_synchronous_save_throws_too()
    {
        var name = Unique.Name("Orphan", "يتيم");

        await InClinicAsync(null, db =>
        {
            db.Drugs.Add(new Drug { Name = name, CategoryId = CategoryIds.Eye });
            Should.Throw<InvalidOperationException>(() => db.SaveChanges());
            return Task.CompletedTask;
        });

        (await App.QueryDbAsync(db => db.Drugs.IgnoreQueryFilters().CountAsync(d => d.Name == name))).ShouldBe(0);
    }

    [Fact]
    public async Task Rows_only_read_in_a_save_are_neither_checked_nor_stamped()
    {
        var a = await Data.Clinic();
        var b = await Data.Clinic();
        var bDrug = await Data.Drug(b);
        var aRead = await Data.Drug(a);
        var aEdited = await Data.Drug(a);
        var created = Clock.GetUtcNow().UtcDateTime;
        Clock.Advance(TimeSpan.FromMinutes(1));

        await InClinicAsync(a.Id, async db =>
        {
            // Another clinic's row and an own row only read (tracked, unchanged), one own row edited
            await db.Drugs.IgnoreQueryFilters().SingleAsync(d => d.Id == bDrug.Id);
            await db.Drugs.SingleAsync(d => d.Id == aRead.Id);
            (await db.Drugs.SingleAsync(d => d.Id == aEdited.Id)).Name = aEdited.Name + " edited";
            await db.SaveChangesAsync();
        });

        var stamps = await App.QueryDbAsync(db => db.Drugs.IgnoreQueryFilters()
            .Where(d => d.Id == bDrug.Id || d.Id == aRead.Id || d.Id == aEdited.Id)
            .ToDictionaryAsync(d => d.Id, d => d.UpdatedAt));
        stamps[bDrug.Id].ShouldBe(created);
        stamps[aRead.Id].ShouldBe(created);
        stamps[aEdited.Id].ShouldBe(Clock.GetUtcNow().UtcDateTime);
    }

    [Fact]
    [Trait("Case", "ISO-032")]
    public async Task In_one_clinic_its_own_rows_are_saved_and_new_ones_get_its_id()
    {
        var a = await Data.Clinic();
        var unset = Unique.Name("Unset", "بلا عيادة");
        var explicitlyOwn = Unique.Name("Own", "خاص");
        var drug = await Data.Drug(a);

        await InClinicAsync(a.Id, async db =>
        {
            db.Drugs.Add(new Drug { Name = unset, CategoryId = CategoryIds.Eye });
            db.Drugs.Add(new Drug { Name = explicitlyOwn, ClinicId = a.Id, CategoryId = CategoryIds.Eye });
            (await db.Drugs.SingleAsync(d => d.Id == drug.Id)).Name = drug.Name + " edited";
            await db.SaveChangesAsync();
        });
        await InClinicAsync(a.Id, async db =>
        {
            db.Drugs.Remove(await db.Drugs.SingleAsync(d => d.Name == explicitlyOwn));
            await db.SaveChangesAsync();
        });

        (await App.QueryDbAsync(db => db.Drugs.IgnoreQueryFilters().SingleAsync(d => d.Name == unset))).ClinicId.ShouldBe(a.Id);
        (await App.QueryDbAsync(db => db.Drugs.IgnoreQueryFilters().CountAsync(d => d.Name == explicitlyOwn))).ShouldBe(0);
        (await App.QueryDbAsync(db => db.Drugs.IgnoreQueryFilters().SingleAsync(d => d.Id == drug.Id))).Name.ShouldBe(drug.Name + " edited");
    }

    [Fact]
    [Trait("Case", "ISO-033")]
    public async Task Replacing_a_stored_lines_drug_with_another_clinics_own_drug_is_400_drugNotFound_and_changes_nothing()
    {
        // No database constraint replaces FK_ProtocolItems_Drugs_DrugId_ClinicId (design M1.7 D4): the protocol handlers
        // look every line's drug up through the clinic filter
        var a = await Data.Clinic();
        var b = await Data.Clinic();
        var aDrug = await Data.Drug(a);
        var other = await Data.Drug(a);
        var aProtocol = await Data.Protocol(a).With(aDrug).With(other);
        var bDrug = await Data.Drug(b);
        var owner = await Login.OwnerAsync(a);

        var response = await owner.PutAsync($"/api/v1/protocols/{aProtocol.Id}",
            new { name = aProtocol.Name, items = new[] { new { drugId = bDrug.Id }, new { drugId = other.Id } } });

        await response.ShouldBeProblemAsync(HttpStatusCode.BadRequest, "drugNotFound");
        (await App.QueryDbAsync(db => db.ProtocolItems.IgnoreQueryFilters().Where(i => i.ProtocolId == aProtocol.Id)
            .OrderBy(i => i.Order).Select(i => i.DrugId).ToListAsync())).ShouldBe([aDrug.Id, other.Id]);
    }

    [Fact]
    [Trait("Case", "ISO-034")]
    public async Task Raw_sql_cannot_put_a_line_into_another_clinics_protocol()
    {
        var a = await Data.Clinic();
        var b = await Data.Clinic();
        var aDrug = await Data.Drug(a);
        var bProtocol = await Data.Protocol(b);

        var error = await InsertLineAsync(clinicId: a.Id, protocolId: bProtocol.Id, drugId: aDrug.Id);

        error.SqlState.ShouldBe(PostgresErrorCodes.ForeignKeyViolation);
        error.ConstraintName.ShouldBe("FK_ProtocolItems_Protocols_ProtocolId_ClinicId");
    }

    [Fact]
    [Trait("Case", "ISO-035")]
    public async Task Raw_sql_cannot_give_a_staff_member_another_clinics_role()
    {
        var a = await Data.Clinic();
        var b = await Data.Clinic();
        var staff = await Data.Staff(a);

        var error = await Should.ThrowAsync<PostgresException>(() => App.OutsideTheApp.ExecuteAsync(
            """INSERT INTO "StaffRoles" ("StaffId", "RoleId", "ClinicId") VALUES (@p0, @p1, @p2)""",
            staff.Id, b.RoleId("Assistant"), a.Id));

        error.SqlState.ShouldBe(PostgresErrorCodes.ForeignKeyViolation);
        error.ConstraintName.ShouldStartWith("FK_StaffRoles_Roles");
    }

    [Fact]
    [Trait("Case", "ISO-036")]
    public async Task A_second_template_clinic_is_rejected_by_the_partial_unique_index()
    {
        var error = await Should.ThrowAsync<PostgresException>(() => App.OutsideTheApp.ExecuteAsync(
            """
            INSERT INTO "Clinics" ("Name", "Status", "IsTemplate", "CreatedAt", "UpdatedAt")
            VALUES (@p0, 'active', true, now(), now())
            """, Unique.Name("Second template", "قالب ثان")));

        error.SqlState.ShouldBe(PostgresErrorCodes.UniqueViolation);
        error.ConstraintName.ShouldContain("IsTemplate");
        (await App.QueryDbAsync(db => db.Clinics.CountAsync(c => c.IsTemplate))).ShouldBe(1);
    }

    /// <summary>Runs <paramref name="work"/> on a fresh app DbContext acting in <paramref name="clinicId"/> (none when null).</summary>
    private async Task InClinicAsync(int? clinicId, Func<AppDbContext, Task> work)
    {
        await using var scope = App.Factory.Services.CreateAsyncScope();
        using var _ = clinicId is { } id ? scope.ServiceProvider.GetRequiredService<IClinicScope>().Use(id) : null;
        await work(scope.ServiceProvider.GetRequiredService<AppDbContext>());
    }

    private Task<PostgresException> InsertLineAsync(int clinicId, int protocolId, int drugId) =>
        Should.ThrowAsync<PostgresException>(() => App.OutsideTheApp.ExecuteAsync(
            """
            INSERT INTO "ProtocolItems" ("ClinicId", "ProtocolId", "DrugId", "Order", "CreatedAt", "UpdatedAt")
            VALUES (@p0, @p1, @p2, 99, now(), now())
            """, clinicId, protocolId, drugId));
}
