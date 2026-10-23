using ClinicHub.Application.Common.Abstractions;
using ClinicHub.Application.Features.Catalog.Categories;
using ClinicHub.Domain.Catalog;
using ClinicHub.Infrastructure.Database;
using ClinicHub.IntegrationTests.Harness.Builders;
using ClinicHub.IntegrationTests.Harness.Hosting;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Shouldly;

namespace ClinicHub.IntegrationTests.Catalog.SharedCatalog;

/// <summary>
/// The save interceptor's guards on drug rows (design M1.7 D2 table, D4: the only guard, no database constraint),
/// through the app's own <see cref="AppDbContext"/> as a buggy handler would use it: in a clinic context, with no
/// clinic, and inside <c>UseSharedCatalog()</c>. Every refused save throws an <see cref="InvalidOperationException"/>
/// (as the clinic guards of ISO-031/ISO-032) and writes nothing. Shared rows are test-created (D12).
/// </summary>
[Collection(CatalogGuardsCollection.Name)]
[Trait("Area", "isolation")]
public class DrugGuardTests(AppFixture app) : IntegrationTest(app)
{
    [Fact]
    [Trait("Case", "CAT-024")]
    [Trait("Case", "ISO-032")]
    public async Task A_clinic_request_changing_a_shared_drug_in_code_throws_and_writes_nothing()
    {
        var shared = await Data.SharedDrug().Described("Shared description");
        var clinic = await Data.Clinic();

        await InScopeAsync(clinic.Id, writingShared: false, async db =>
        {
            // The clinic filter shows the shared row: a handler bug could load and change it
            var loaded = await db.Drugs.SingleAsync(d => d.Id == shared.Id);
            loaded.Name = "Changed by a clinic";
            await Should.ThrowAsync<InvalidOperationException>(() => db.SaveChangesAsync());
        });
        await InScopeAsync(clinic.Id, writingShared: false, async db =>
        {
            (await db.Drugs.SingleAsync(d => d.Id == shared.Id)).Description = "Changed by a clinic";
            await Should.ThrowAsync<InvalidOperationException>(() => db.SaveChangesAsync());
        });

        var stored = await StoredAsync(shared.Id);
        stored.Name.ShouldBe(shared.Name);
        stored.Description.ShouldBe("Shared description");
    }

    [Fact]
    [Trait("Case", "CAT-024")]
    [Trait("Case", "ISO-032")]
    public async Task A_clinic_request_saving_a_detached_shared_drug_with_ClinicId_0_throws_and_writes_nothing()
    {
        // A ClinicId of 0 counts as none (shared), as on an added row (CAT-025): the row stays read-only in a clinic
        var shared = await Data.SharedDrug().Described("Shared description");
        var clinic = await Data.Clinic();

        await InScopeAsync(clinic.Id, writingShared: false, async db =>
        {
            db.Drugs.Update(new Drug
            {
                Id = shared.Id, Name = "Overwritten by a clinic", ClinicId = 0,
                CategoryId = CategoryIds.Eye, SubCategoryId = SubCategoryIds.Glaucoma,
            });
            await Should.ThrowAsync<InvalidOperationException>(() => db.SaveChangesAsync());
        });

        var stored = await StoredAsync(shared.Id);
        stored.Name.ShouldBe(shared.Name);
        stored.Description.ShouldBe("Shared description");
        stored.ClinicId.ShouldBeNull();
    }

    [Fact]
    [Trait("Case", "CAT-231")]
    public async Task With_no_clinic_and_outside_UseSharedCatalog_changing_a_shared_drug_throws_and_writes_nothing()
    {
        var shared = await Data.SharedDrug().Described("Shared description");

        await InScopeAsync(null, writingShared: false, async db =>
        {
            var loaded = await db.Drugs.SingleAsync(d => d.Id == shared.Id);
            loaded.Name = "Changed outside the admin use cases";
            loaded.Description = "Changed outside the admin use cases";
            await Should.ThrowAsync<InvalidOperationException>(() => db.SaveChangesAsync());
        });
        await InScopeAsync(null, writingShared: false, async db =>
        {
            (await db.Drugs.SingleAsync(d => d.Id == shared.Id)).Withdraw(Clock.GetUtcNow().UtcDateTime);
            await Should.ThrowAsync<InvalidOperationException>(() => db.SaveChangesAsync());
        });

        var stored = await StoredAsync(shared.Id);
        stored.Name.ShouldBe(shared.Name);
        stored.Description.ShouldBe("Shared description");
        stored.IsWithdrawn.ShouldBeFalse();
    }

    [Theory]
    [Trait("Case", "CAT-025")]
    [Trait("Case", "ISO-031")]
    [InlineData(null)]
    [InlineData(0)]
    public async Task With_no_clinic_and_outside_UseSharedCatalog_adding_a_drug_without_a_clinic_throws(int? clinicId)
    {
        var name = Unique.Name("Not shared by mistake", "خطأ");

        await InScopeAsync(null, writingShared: false, async db =>
        {
            db.Drugs.Add(NewDrug(name, clinicId));
            await Should.ThrowAsync<InvalidOperationException>(() => db.SaveChangesAsync());
        });

        (await CountNamedAsync(name)).ShouldBe(0);
    }

    [Fact]
    [Trait("Case", "CAT-025")]
    public async Task Inside_UseSharedCatalog_the_same_drug_is_added_as_a_shared_one()
    {
        var name = Unique.Name("Shared on purpose", "مشترك");

        await InScopeAsync(null, writingShared: true, async db =>
        {
            db.Drugs.Add(NewDrug(name, null));
            await db.SaveChangesAsync();
        });

        var stored = await App.QueryDbAsync(db => db.Drugs.IgnoreQueryFilters().AsNoTracking().SingleAsync(d => d.Name == name));
        stored.ClinicId.ShouldBeNull();
    }

    [Fact]
    [Trait("Case", "CAT-026")]
    [Trait("Case", "ISO-032")]
    public async Task Deleting_a_shared_drug_through_EF_throws_in_a_clinic_and_inside_UseSharedCatalog()
    {
        var shared = await Data.SharedDrug();
        var clinic = await Data.Clinic();

        await InScopeAsync(clinic.Id, writingShared: false, async db =>
        {
            db.Drugs.Remove(await db.Drugs.SingleAsync(d => d.Id == shared.Id));
            await Should.ThrowAsync<InvalidOperationException>(() => db.SaveChangesAsync());
        });
        await InScopeAsync(null, writingShared: true, async db =>
        {
            db.Drugs.Remove(await db.Drugs.SingleAsync(d => d.Id == shared.Id));
            await Should.ThrowAsync<InvalidOperationException>(() => db.SaveChangesAsync());
        });

        (await StoredAsync(shared.Id)).ShouldNotBeNull("the shared drug is still there");
    }

    [Fact]
    [Trait("Case", "CAT-027")]
    [Trait("Case", "ISO-032")]
    public async Task Changing_a_drugs_owner_throws_in_both_contexts_and_writes_nothing()
    {
        var a = await Data.Clinic();
        var b = await Data.Clinic();
        var own = await Data.Drug(a);
        var shared = await Data.SharedDrug();

        foreach (var newOwner in new int?[] { null, b.Id })
        {
            await InScopeAsync(a.Id, writingShared: false, async db =>
            {
                (await db.Drugs.SingleAsync(d => d.Id == own.Id)).ClinicId = newOwner;
                await Should.ThrowAsync<InvalidOperationException>(() => db.SaveChangesAsync());
            });
            await InScopeAsync(null, writingShared: true, async db =>
            {
                (await db.Drugs.IgnoreQueryFilters().SingleAsync(d => d.Id == own.Id)).ClinicId = newOwner;
                await Should.ThrowAsync<InvalidOperationException>(() => db.SaveChangesAsync());
            });
        }
        await InScopeAsync(a.Id, writingShared: false, async db =>
        {
            (await db.Drugs.SingleAsync(d => d.Id == shared.Id)).ClinicId = a.Id;
            await Should.ThrowAsync<InvalidOperationException>(() => db.SaveChangesAsync());
        });
        await InScopeAsync(null, writingShared: true, async db =>
        {
            (await db.Drugs.SingleAsync(d => d.Id == shared.Id)).ClinicId = a.Id;
            await Should.ThrowAsync<InvalidOperationException>(() => db.SaveChangesAsync());
        });

        (await StoredAsync(own.Id)).ClinicId.ShouldBe(a.Id);
        (await StoredAsync(shared.Id)).ClinicId.ShouldBeNull();
    }

    public static TheoryData<string> DosingColumns => new()
    {
        "DoseAmount", "DoseUnit", "Frequency", "FrequencyValue", "FrequencyText", "DurationValue", "DurationUnit", "Eye", "TaperSteps",
    };

    [Theory]
    [Trait("Case", "CAT-028")]
    [Trait("Case", "ISO-032")]
    [MemberData(nameof(DosingColumns))]
    public async Task Inside_UseSharedCatalog_a_shared_drug_with_one_dosing_column_set_throws(string column)
    {
        var shared = await Data.SharedDrug();

        await InScopeAsync(null, writingShared: true, async db =>
        {
            (await db.Drugs.SingleAsync(d => d.Id == shared.Id)).DefaultDosing = OneColumn(column);
            await Should.ThrowAsync<InvalidOperationException>(() => db.SaveChangesAsync());
        });
        // Also on an otherwise valid admin update (a rename)
        await InScopeAsync(null, writingShared: true, async db =>
        {
            var loaded = await db.Drugs.SingleAsync(d => d.Id == shared.Id);
            loaded.Name = shared.Name + " renamed";
            loaded.DefaultDosing = OneColumn(column);
            await Should.ThrowAsync<InvalidOperationException>(() => db.SaveChangesAsync());
        });

        var stored = await StoredAsync(shared.Id);
        stored.DefaultDosing.ShouldBeNull();
        stored.Name.ShouldBe(shared.Name);
    }

    [Fact]
    [Trait("Case", "CAT-028")]
    public async Task Inside_UseSharedCatalog_a_shared_drug_with_an_empty_dosing_is_saved_with_no_dosing()
    {
        // The D2 rule is "any DefaultDosing_* set": an empty dosing (no column set) is no dosing
        var shared = await Data.SharedDrug();
        var renamed = shared.Name + " renamed";

        await InScopeAsync(null, writingShared: true, async db =>
        {
            var loaded = await db.Drugs.SingleAsync(d => d.Id == shared.Id);
            loaded.Name = renamed;
            loaded.DefaultDosing = new Dosing();
            await db.SaveChangesAsync();
        });

        var stored = await StoredAsync(shared.Id);
        stored.Name.ShouldBe(renamed);
        stored.DefaultDosing.ShouldBeNull();
    }

    [Fact]
    [Trait("Case", "CAT-028")]
    [Trait("Case", "ISO-032")]
    public async Task An_own_drug_marked_withdrawn_in_its_clinic_throws()
    {
        var clinic = await Data.Clinic();
        var own = await Data.Drug(clinic);

        await InScopeAsync(clinic.Id, writingShared: false, async db =>
        {
            (await db.Drugs.SingleAsync(d => d.Id == own.Id)).Withdraw(Clock.GetUtcNow().UtcDateTime);
            await Should.ThrowAsync<InvalidOperationException>(() => db.SaveChangesAsync());
        });

        (await StoredAsync(own.Id)).IsWithdrawn.ShouldBeFalse();
    }

    /// <summary>A dosing with exactly one of the 9 <c>DefaultDosing_*</c> columns set.</summary>
    private static Dosing OneColumn(string column) => column switch
    {
        "DoseAmount" => new Dosing { DoseAmount = 1 },
        "DoseUnit" => new Dosing { DoseUnit = "drop" },
        "Frequency" => new Dosing { Frequency = "daily" },
        "FrequencyValue" => new Dosing { FrequencyValue = 4 },
        "FrequencyText" => new Dosing { FrequencyText = "after meals" },
        "DurationValue" => new Dosing { DurationValue = 1 },
        "DurationUnit" => new Dosing { DurationUnit = "weeks" },
        "Eye" => new Dosing { Eye = "both" },
        "TaperSteps" => new Dosing { TaperSteps = [new TaperStep { Frequency = "daily", FrequencyValue = 4, DurationValue = 1, DurationUnit = "weeks" }] },
        _ => throw new ArgumentOutOfRangeException(nameof(column), column, null),
    };

    private static Drug NewDrug(string name, int? clinicId) =>
        new() { Name = name, ClinicId = clinicId, CategoryId = CategoryIds.Eye, SubCategoryId = SubCategoryIds.Glaucoma };

    /// <summary>
    /// Runs <paramref name="work"/> on a fresh app DbContext acting in <paramref name="clinicId"/> (none when null),
    /// inside <c>UseSharedCatalog()</c> when <paramref name="writingShared"/>.
    /// </summary>
    private async Task InScopeAsync(int? clinicId, bool writingShared, Func<AppDbContext, Task> work)
    {
        await using var scope = App.Factory.Services.CreateAsyncScope();
        var clinicScope = scope.ServiceProvider.GetRequiredService<IClinicScope>();
        using var clinic = clinicId is { } id ? clinicScope.Use(id) : null;
        using var shared = writingShared ? clinicScope.UseSharedCatalog() : null;
        await work(scope.ServiceProvider.GetRequiredService<AppDbContext>());
    }

    private Task<Drug> StoredAsync(int drugId) =>
        App.QueryDbAsync(db => db.Drugs.IgnoreQueryFilters().AsNoTracking().SingleOrDefaultAsync(d => d.Id == drugId));

    private Task<int> CountNamedAsync(string name) =>
        App.QueryDbAsync(db => db.Drugs.IgnoreQueryFilters().CountAsync(d => d.Name == name));
}
