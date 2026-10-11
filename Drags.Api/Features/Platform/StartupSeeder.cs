using Drags.Api.Database;
using Drags.Api.Features.Identity;
using Drags.Api.Models;
using Drags.Api.Shared;
using Microsoft.EntityFrameworkCore;

namespace Drags.Api.Features.Platform;

/// <summary>Startup seeding, idempotent (runs on every start after the migrations).</summary>
public static class StartupSeeder
{
    public const string TemplateClinicName = "Template clinic";
    public const string DevOwnerName = "Dev Owner";

    public static async Task SeedAsync(AppDbContext db, ClinicContext clinicContext, PlatformSettings platform,
        bool isDevelopment)
    {
        if (!await db.Clinics.AnyAsync(c => c.IsTemplate))
        {
            db.Clinics.Add(new Clinic { Name = TemplateClinicName, IsTemplate = true });
            await db.SaveChangesAsync();
        }

        await IdentitySeeder.SeedSuperAdminsAsync(db, platform);

        // Development, empty DB: two clinics so the app works and isolation can be checked by hand
        if (!isDevelopment || await db.Clinics.AnyAsync(c => !c.IsTemplate))
            return;

        // All or nothing: a half-done seed would never be repaired (the check above would skip it)
        await using var transaction = await db.Database.BeginTransactionAsync();

        // Staff in both demo clinics, so clinic switching can be tried
        var devOwner = string.IsNullOrWhiteSpace(platform.DevOwnerPhone)
            ? null
            : await IdentitySeeder.EnsureUserAsync(db, platform.DevOwnerPhone, "Platform:DevOwnerPhone", platform.DefaultRegion);

        await AddClinicAsync(db, clinicContext, "Demo clinic", devOwner, Enumerable.Range(1, 10000).Select(x => new Drug
        {
            Name = $"Drug number {x}",
            Description = $"Description of drug number {x}"
        }).ToList());

        var secondDrugs = new List<Drug>
        {
            new() { Name = "Moxifloxacin 0.5%", Description = "Antibiotic eye drops" },
            new() { Name = "Prednisolone acetate 1%", Description = "Steroid eye drops" },
            new() { Name = "Artificial tears", Description = "Lubricant eye drops" },
        };
        await AddClinicAsync(db, clinicContext, "Second demo clinic", devOwner, secondDrugs);

        db.DrugGroups.Add(new DrugGroup
        {
            Name = "After cataract surgery",
            Items = secondDrugs.Select((drug, index) => new DrugGroupItem { DrugId = drug.Id, Order = index }).ToList()
        });
        await db.SaveChangesAsync();
        await transaction.CommitAsync();
        clinicContext.ClinicId = null;
    }

    /// <summary>
    /// Creates a clinic, then saves its drugs (and the dev owner as staff) inside it (leaves the
    /// context on that clinic).
    /// </summary>
    private static async Task AddClinicAsync(AppDbContext db, ClinicContext clinicContext, string name, User devOwner,
        List<Drug> drugs)
    {
        var clinic = new Clinic { Name = name };
        db.Clinics.Add(clinic);
        await db.SaveChangesAsync();

        clinicContext.ClinicId = clinic.Id;
        db.Drugs.AddRange(drugs);
        if (devOwner is not null)
            db.Staff.Add(new Staff { UserId = devOwner.Id, FullName = DevOwnerName });
        await db.SaveChangesAsync();
        db.ChangeTracker.Clear();
    }
}
