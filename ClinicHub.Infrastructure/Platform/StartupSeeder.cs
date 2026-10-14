using ClinicHub.Application.Common.Abstractions;
using ClinicHub.Application.Common.Settings;
using ClinicHub.Application.Features.Access;
using ClinicHub.Application.Features.Identity;
using ClinicHub.Domain.Access;
using ClinicHub.Domain.Catalog;
using ClinicHub.Domain.Identity;
using ClinicHub.Domain.Platform;
using ClinicHub.Infrastructure.Database;
using Microsoft.EntityFrameworkCore;

namespace ClinicHub.Infrastructure.Platform;

/// <summary>
/// Startup seeding, idempotent (runs on every start after the migrations). In Infrastructure: the dev
/// seed needs its own transaction and <c>ChangeTracker.Clear()</c>, which <see cref="IAppDbContext"/> hides.
/// </summary>
public sealed class StartupSeeder(
    AppDbContext db,
    ClinicContext clinicContext,
    IdentitySeeder identitySeeder,
    PlatformSettings platform)
{
    public const string TemplateClinicName = "Template clinic";
    public const string DevOwnerName = "Dev Owner";
    public const string DevAssistantName = "Dev Assistant";
    public const string DevViewerRoleName = "Viewer";

    public async Task SeedAsync(bool isDevelopment)
    {
        if (!await db.Clinics.AnyAsync(c => c.IsTemplate))
        {
            db.Clinics.Add(new Clinic { Name = TemplateClinicName, IsTemplate = true });
            await db.SaveChangesAsync();
        }

        await identitySeeder.SeedSuperAdminsAsync();

        // Development, empty DB: two clinics so the app works and isolation can be checked by hand
        if (!isDevelopment || await db.Clinics.AnyAsync(c => !c.IsTemplate))
            return;

        // All or nothing: a half-done seed would never be repaired (the check above would skip it)
        await using var transaction = await db.Database.BeginTransactionAsync();

        // Staff in both demo clinics, so clinic switching and the permission checks can be tried
        var devOwner = await DevUserAsync(platform.DevOwnerPhone, "Platform:DevOwnerPhone");
        var devAssistant = await DevUserAsync(platform.DevAssistantPhone, "Platform:DevAssistantPhone");
        // One staff row per user and clinic: the same phone in both settings stays the owner
        if (devAssistant?.Id == devOwner?.Id)
            devAssistant = null;

        var demoRoles = await AddClinicAsync("Demo clinic", Enumerable.Range(1, 10000).Select(x => new Drug
        {
            Name = $"Drug number {x}",
            Description = $"Description of drug number {x}"
        }).ToList());
        AddStaff(devOwner, DevOwnerName, demoRoles[DefaultRoles.Owner]);
        // No deletes
        AddStaff(devAssistant, DevAssistantName, demoRoles[DefaultRoles.Assistant]);
        await db.SaveChangesAsync();
        // Don't keep the 10,000 drugs tracked through the next clinic's saves
        db.ChangeTracker.Clear();

        var secondDrugs = new List<Drug>
        {
            new() { Name = "Moxifloxacin 0.5%", Description = "Antibiotic eye drops" },
            new() { Name = "Prednisolone acetate 1%", Description = "Steroid eye drops" },
            new() { Name = "Artificial tears", Description = "Lubricant eye drops" },
        };
        var secondRoles = await AddClinicAsync("Second demo clinic", secondDrugs);
        // A custom read-only role: no add, edit, delete, nor the prescription page
        var viewer = new Role
        {
            Name = DevViewerRoleName,
            Permissions = new[] { Permissions.Drugs.List, Permissions.Drugs.Details, Permissions.Groups.List, Permissions.Groups.Details }
                .Select(p => new RolePermission { Permission = p }).ToList(),
        };
        db.Roles.Add(viewer);
        AddStaff(devOwner, DevOwnerName, secondRoles[DefaultRoles.Owner]);
        AddStaff(devAssistant, DevAssistantName, viewer);

        db.DrugGroups.Add(new DrugGroup
        {
            Name = "After cataract surgery",
            Items = secondDrugs.Select((drug, index) => new DrugGroupItem { DrugId = drug.Id, Order = index }).ToList()
        });
        await db.SaveChangesAsync();
        await transaction.CommitAsync();
        db.ChangeTracker.Clear();
        clinicContext.ClinicId = null;
    }

    private async Task<User> DevUserAsync(string phone, string setting) =>
        string.IsNullOrWhiteSpace(phone) ? null : await identitySeeder.EnsureUserAsync(phone, setting);

    private void AddStaff(User user, string fullName, Role role)
    {
        if (user is not null)
            db.Staff.Add(new Staff { UserId = user.Id, FullName = fullName, Roles = [new StaffRole { Role = role }] });
    }

    /// <summary>
    /// Creates a clinic, then saves its drugs and default roles inside it; returns the roles by name
    /// (leaves the context on that clinic).
    /// </summary>
    private async Task<IReadOnlyDictionary<string, Role>> AddClinicAsync(string name, List<Drug> drugs)
    {
        var clinic = new Clinic { Name = name };
        db.Clinics.Add(clinic);
        await db.SaveChangesAsync();

        clinicContext.ClinicId = clinic.Id;
        db.Drugs.AddRange(drugs);
        await db.SaveChangesAsync();
        return await DefaultRoles.SeedAsync(db, clinicContext, clinic.Id);
    }
}
