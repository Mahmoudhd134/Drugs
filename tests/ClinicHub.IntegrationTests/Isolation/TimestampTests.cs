using ClinicHub.Application.Features.Catalog.Categories;
using System.Net;
using ClinicHub.Application.Common.Abstractions;
using ClinicHub.Domain.Catalog;
using ClinicHub.Infrastructure.Database;
using ClinicHub.Application.Features.Access.StaffMembers;
using ClinicHub.Application.Features.Catalog.Protocols;
using ClinicHub.Application.Features.Catalog.Drugs;
using ClinicHub.IntegrationTests.Access;
using ClinicHub.IntegrationTests.Harness.Assertions;
using ClinicHub.IntegrationTests.Harness.Builders;
using ClinicHub.IntegrationTests.Harness.Hosting;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Shouldly;

namespace ClinicHub.IntegrationTests.Isolation;

/// <summary>
/// UTC timestamps filled by the save interceptor (clinic-scoping tech § Backend): a new row gets
/// <c>CreatedAt = UpdatedAt = now</c>; a change moves only <c>UpdatedAt</c>, also when only an owned value (a dosing)
/// or only a protocol's lines changed. The test clock makes "now" exact.
/// </summary>
[Collection(IsolationCollection3.Name)]
[Trait("Area", "isolation")]
public class TimestampTests(AppFixture app) : IntegrationTest(app)
{
    private DateTime Now => Clock.GetUtcNow().UtcDateTime;

    [Fact]
    [Trait("Case", "ISO-037")]
    public async Task A_new_drug_protocol_and_line_are_created_and_updated_now_in_utc()
    {
        var clinic = await Data.Clinic();
        var owner = await Login.OwnerAsync(clinic);
        Clock.Advance(TimeSpan.FromMinutes(3));

        var drug = await (await owner.PostAsync("/api/v1/drugs", new { categoryId = CategoryIds.Eye, name = Unique.Name("Tobradex", "توبرادكس") })).ReadAsync<DrugDto>();
        var protocol = await (await owner.PostAsync("/api/v1/protocols", CatalogRoutes.ProtocolBody(drug.Id))).ReadAsync<ProtocolDto>();

        var drugStamps = await DrugStampsAsync(drug.Id);
        var protocolStamps = await ProtocolStampsAsync(protocol.Id);
        var lineStamps = await LineStampsAsync(protocol.Id);
        foreach (var (createdAt, updatedAt) in new[] { drugStamps, protocolStamps, lineStamps.ShouldHaveSingleItem() })
        {
            createdAt.Kind.ShouldBe(DateTimeKind.Utc);
            createdAt.ShouldBe(Now);
            updatedAt.ShouldBe(Now);
        }
    }

    [Fact]
    [Trait("Case", "ISO-038")]
    public async Task A_drug_edit_moves_only_updated_at_also_for_a_dosing_only_change()
    {
        var clinic = await Data.Clinic();
        var drug = await Data.Drug(clinic);
        var created = Now;
        var owner = await Login.OwnerAsync(clinic);

        Clock.Advance(TimeSpan.FromMinutes(1));
        await (await owner.PutAsync($"/api/v1/drugs/{drug.Id}", new { categoryId = CategoryIds.Eye, name = drug.Name + " 2" })).ShouldBeOkAsync();
        (await DrugStampsAsync(drug.Id)).ShouldBe((created, Now), "name changed");

        Clock.Advance(TimeSpan.FromMinutes(1));
        await (await owner.PutAsync($"/api/v1/drugs/{drug.Id}", new { categoryId = CategoryIds.Eye, name = drug.Name + " 2", defaultDosing = Dosings.Drops() })).ShouldBeOkAsync();
        (await DrugStampsAsync(drug.Id)).ShouldBe((created, Now), "dosing added");

        Clock.Advance(TimeSpan.FromMinutes(1));
        await (await owner.PutAsync($"/api/v1/drugs/{drug.Id}", new { categoryId = CategoryIds.Eye, name = drug.Name + " 2", defaultDosing = Dosings.Drops(amount: 2) })).ShouldBeOkAsync();
        (await DrugStampsAsync(drug.Id)).ShouldBe((created, Now), "dosing changed");

        Clock.Advance(TimeSpan.FromMinutes(1));
        await (await owner.PutAsync($"/api/v1/drugs/{drug.Id}", new { categoryId = CategoryIds.Eye, name = drug.Name + " 2", defaultDosing = (object)null })).ShouldBeOkAsync();
        (await DrugStampsAsync(drug.Id)).ShouldBe((created, Now), "dosing removed");
    }

    [Fact]
    [Trait("Case", "ISO-039")]
    public async Task A_protocol_save_that_changes_only_its_lines_moves_the_protocols_updated_at()
    {
        var clinic = await Data.Clinic();
        var first = await Data.Drug(clinic);
        var second = await Data.Drug(clinic);
        var protocol = await Data.Protocol(clinic).With(first);
        var created = Now;
        var owner = await Login.OwnerAsync(clinic);

        Clock.Advance(TimeSpan.FromMinutes(5));
        await (await owner.PutAsync($"/api/v1/protocols/{protocol.Id}",
            new { name = protocol.Name, items = new[] { new { drugId = first.Id }, new { drugId = second.Id } } })).ShouldBeOkAsync();

        (await ProtocolStampsAsync(protocol.Id)).ShouldBe((created, Now));
    }

    [Fact]
    public async Task A_change_to_a_row_that_belongs_to_no_clinic_moves_only_its_updated_at()
    {
        var clinic = await Data.Clinic();
        var created = Now;
        var admin = await Login.SuperAdminAsync();

        Clock.Advance(TimeSpan.FromMinutes(2));
        await (await admin.PutAsync($"/api/v1/admin/clinics/{clinic.Id}", new { name = clinic.Name + " 2" })).ShouldBeOkAsync();

        var stamps = await App.QueryDbAsync(db => db.Clinics.Where(c => c.Id == clinic.Id)
            .Select(c => new { c.CreatedAt, c.UpdatedAt }).SingleAsync());
        stamps.CreatedAt.ShouldBe(created);
        stamps.UpdatedAt.ShouldBe(Now);
    }

    [Fact]
    public async Task A_staff_member_added_with_roles_is_stamped_with_the_clinic_with_its_roles()
    {
        var clinic = await Data.Clinic();
        var admin = await Login.SuperAdminAsync();

        var staff = await (await admin.PostAsync($"/api/v1/admin/clinics/{clinic.Id}/staff", new
        {
            phone = Unique.Phone(), fullName = Unique.Name("Staff", "موظف"),
            roleIds = new[] { clinic.RoleId("Doctor"), clinic.RoleId("Assistant") },
        })).ReadAsync<StaffMemberDto>();

        (await App.QueryDbAsync(db => db.Staff.IgnoreQueryFilters().Where(s => s.Id == staff.Id).Select(s => s.ClinicId).SingleAsync()))
            .ShouldBe(clinic.Id);
        var roleClinics = await App.QueryDbAsync(db => db.StaffRoles.IgnoreQueryFilters()
            .Where(r => r.StaffId == staff.Id).Select(r => r.ClinicId).ToListAsync());
        roleClinics.Count.ShouldBe(2);
        roleClinics.ShouldAllBe(id => id == clinic.Id);
    }

    [Fact]
    [Trait("Case", "ISO-038")]
    public async Task A_change_never_overwrites_created_at_even_when_the_code_sets_it()
    {
        var clinic = await Data.Clinic();
        var drug = await Data.Drug(clinic);
        var created = Now;
        Clock.Advance(TimeSpan.FromMinutes(1));

        await InClinicAsync(clinic.Id, async db =>
        {
            var loaded = await db.Drugs.SingleAsync(d => d.Id == drug.Id);
            loaded.Name = drug.Name + " edited";
            loaded.CreatedAt = new DateTime(2000, 1, 1, 0, 0, 0, DateTimeKind.Utc);
            await db.SaveChangesAsync();
        });

        (await DrugStampsAsync(drug.Id)).ShouldBe((created, Now));
    }

    [Fact]
    [Trait("Case", "ISO-037")]
    public async Task A_synchronous_save_also_stamps_the_clinic_and_the_times()
    {
        var clinic = await Data.Clinic();
        var name = Unique.Name("Tobradex", "توبرادكس");

        await InClinicAsync(clinic.Id, db =>
        {
            db.Drugs.Add(new Drug { Name = name });
            db.SaveChanges();
            return Task.CompletedTask;
        });

        var stored = await App.QueryDbAsync(db => db.Drugs.IgnoreQueryFilters().SingleAsync(d => d.Name == name));
        stored.ClinicId.ShouldBe(clinic.Id);
        stored.CreatedAt.ShouldBe(Now);
        stored.UpdatedAt.ShouldBe(Now);
    }

    /// <summary>Runs <paramref name="work"/> on a fresh app DbContext acting in <paramref name="clinicId"/>.</summary>
    private async Task InClinicAsync(int clinicId, Func<AppDbContext, Task> work)
    {
        await using var scope = App.Factory.Services.CreateAsyncScope();
        using var _ = scope.ServiceProvider.GetRequiredService<IClinicScope>().Use(clinicId);
        await work(scope.ServiceProvider.GetRequiredService<AppDbContext>());
    }

    private Task<(DateTime, DateTime)> DrugStampsAsync(int drugId) => App.QueryDbAsync(async db =>
    {
        var row = await db.Drugs.IgnoreQueryFilters().Where(d => d.Id == drugId).Select(d => new { d.CreatedAt, d.UpdatedAt }).SingleAsync();
        return (row.CreatedAt, row.UpdatedAt);
    });

    private Task<(DateTime, DateTime)> ProtocolStampsAsync(int protocolId) => App.QueryDbAsync(async db =>
    {
        var row = await db.Protocols.IgnoreQueryFilters().Where(g => g.Id == protocolId).Select(g => new { g.CreatedAt, g.UpdatedAt }).SingleAsync();
        return (row.CreatedAt, row.UpdatedAt);
    });

    private Task<List<(DateTime, DateTime)>> LineStampsAsync(int protocolId) => App.QueryDbAsync(async db =>
        (await db.ProtocolItems.IgnoreQueryFilters().Where(i => i.ProtocolId == protocolId)
            .Select(i => new { i.CreatedAt, i.UpdatedAt }).ToListAsync())
        .Select(r => (r.CreatedAt, r.UpdatedAt)).ToList());
}
