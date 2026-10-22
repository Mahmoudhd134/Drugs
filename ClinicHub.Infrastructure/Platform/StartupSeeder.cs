using System.Diagnostics;
using ClinicHub.Application.Common.Abstractions;
using ClinicHub.Application.Common.Settings;
using ClinicHub.Application.Features.Access;
using ClinicHub.Application.Features.Access.Roles;
using ClinicHub.Application.Features.Catalog.Categories;
using ClinicHub.Application.Features.Identity.Users;
using ClinicHub.Application.Features.Platform.Clinics.Commands.CreateClinic;
using ClinicHub.Domain.Access;
using ClinicHub.Domain.Catalog;
using ClinicHub.Domain.Identity;
using ClinicHub.Domain.Platform;
using ClinicHub.Infrastructure.Database;
using MediatR;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace ClinicHub.Infrastructure.Platform;

/// <summary>
/// Startup seeding, idempotent (runs on every start after the migrations). In Infrastructure: the dev
/// seed needs its own transaction and <c>ChangeTracker.Clear()</c>, which <see cref="IAppDbContext"/> hides.
/// </summary>
public sealed class StartupSeeder(
    AppDbContext db,
    IClinicScope clinicScope,
    ISender sender,
    IIdentitySeeder identitySeeder,
    IUserAccounts userAccounts,
    IPhoneNormalizer phoneNormalizer,
    PlatformSettings platform,
    ILogger<StartupSeeder> logger) : IStartupSeeder
{
    public const string TemplateClinicName = "Template clinic";
    public const string DemoClinicName = "Demo clinic";
    public const string SecondDemoClinicName = "Second demo clinic";
    public const string DevOwnerName = "Dev Owner";
    public const string DevAssistantName = "Dev Assistant";
    public const string DevViewerRoleName = "Viewer";
    /// <summary>The shared drug of the template's sample protocol (dev seed).</summary>
    public const string SampleSharedDrugName = "VIGAMOX 0.5% EYE DROPS 5 ML";
    /// <summary>The one-time loader of the shared catalog (design M1.7 D11), named by the dev seed's warning.</summary>
    public const string CatalogScript = "data/drug-catalog/tools/load_catalog.py";

    public async Task SeedAsync(bool isDevelopment)
    {
        if (!await db.Clinics.AnyAsync(c => c.IsTemplate))
        {
            db.Clinics.Add(new Clinic { Name = TemplateClinicName, IsTemplate = true });
            await db.SaveChangesAsync();
        }

        await identitySeeder.SeedSuperAdminsAsync();

        // Development, empty DB: sample template content and two clinics provisioned from it, so the app works
        // and isolation can be checked by hand
        if (!isDevelopment || await db.Clinics.AnyAsync(c => !c.IsTemplate))
            return;

        // Invalid → startup error naming the setting; the same phone in both settings stays the owner (one
        // staff row per user and clinic)
        var ownerPhone = DevPhone(platform.DevOwnerPhone, "Platform:DevOwnerPhone");
        var assistantPhone = DevPhone(platform.DevAssistantPhone, "Platform:DevAssistantPhone");
        if (assistantPhone == ownerPhone)
            assistantPhone = null;

        // No catalog yet (design M1.7 § 9, D5): seed nothing, so the first start after the load seeds everything (the
        // check above would skip the template sample if the demo clinics were stored now)
        if (!await CatalogLoadedAsync())
        {
            logger.LogWarning("The shared drug catalog is not loaded: the development data is not seeded (run {Script})",
                CatalogScript);
            return;
        }

        var start = Stopwatch.GetTimestamp();
        // All or nothing: a half-done seed would never be repaired (the check above would skip it). The
        // commands sent below join this transaction (savepoints); their post-commit actions run at once, before
        // this commit: fine, nothing seeded is cached yet
        await using var transaction = await db.Database.BeginTransactionAsync();
        var seeded = await SeedTemplateAsync();
        if (ownerPhone is null)
            // The template sample is still filled; logged on every start until the setting is filled
            logger.LogWarning("Platform:DevOwnerPhone is empty: the demo clinics are not seeded (a clinic needs an owner)");
        else
        {
            await SeedDemoClinicsAsync(ownerPhone, assistantPhone);
            seeded = true;
        }
        await transaction.CommitAsync();
        db.ChangeTracker.Clear();
        if (seeded)
            logger.LogInformation("Development data seeded in {ElapsedMs:0} ms", Stopwatch.GetElapsedTime(start).TotalMilliseconds);
    }

    /// <summary>
    /// The smallest content that proves the copy (design D6, M1.7 § 9): two own drugs with categories and default dosings,
    /// and one protocol on the shared <see cref="SampleSharedDrugName"/> and one own drug (a tapering schedule, the eye
    /// asked when the protocol is added). Skipped (false) when the template already has own drugs (e.g. added by hand,
    /// or seeded on an earlier start while <c>DevOwnerPhone</c> was empty). Runs only once <see cref="CatalogLoadedAsync"/>.
    /// </summary>
    private async Task<bool> SeedTemplateAsync()
    {
        var templateId = await db.Clinics.Where(c => c.IsTemplate).Select(c => c.Id).FirstAsync();
        using (clinicScope.Use(templateId))
        {
            if (await db.Drugs.AnyAsync(d => d.ClinicId != null))
                return false;

            var shared = await db.Drugs.AsNoTracking()
                .FirstAsync(d => d.ClinicId == null && d.Name == SampleSharedDrugName && !d.IsWithdrawn);
            var eye = await db.Categories.Include(c => c.SubCategories).FirstAsync(c => c.Id == CategoryIds.Eye);

            var steroid = new Drug
            {
                Name = "Prednisolone acetate 1%",
                ActiveIngredients = "PREDNISOLONE ACETATE",
                Description = "Steroid eye drops",
                CategoryId = eye.Id,
                SubCategoryId = eye.SubCategories.FirstOrDefault(s => s.NameEn == "Eye anti-inflammatories")?.Id,
                DefaultDosing = new Dosing
                {
                    DoseAmount = 1, DoseUnit = "drop", Frequency = "daily", FrequencyValue = 4,
                    DurationValue = 4, DurationUnit = "weeks",
                },
            };
            var glaucoma = new Drug
            {
                Name = "Timolol 0.5%",
                ActiveIngredients = "TIMOLOL",
                Description = "Glaucoma eye drops",
                CategoryId = eye.Id,
                SubCategoryId = eye.SubCategories.FirstOrDefault(s => s.Id == SubCategoryIds.Glaucoma)?.Id,
                DefaultDosing = new Dosing { DoseAmount = 1, DoseUnit = "drop", Frequency = "daily", FrequencyValue = 2 },
            };
            db.Drugs.AddRange(steroid, glaucoma);
            await db.SaveChangesAsync();

            db.Protocols.Add(new Protocol
            {
                Name = "After cataract surgery",
                Items =
                [
                    // A shared drug has no default dosing: the line gives it
                    new ProtocolItem
                    {
                        DrugId = shared.Id,
                        Order = 0,
                        Dosing = new Dosing
                        {
                            DoseAmount = 1, DoseUnit = "drop", Frequency = "daily", FrequencyValue = 4,
                            DurationValue = 1, DurationUnit = "weeks",
                        },
                    },
                    // Override: taper 4 → 1 times a day over 4 weeks; the dose comes from the drug
                    new ProtocolItem
                    {
                        DrugId = steroid.Id,
                        Order = 1,
                        Dosing = new Dosing
                        {
                            Eye = DosingCodes.AskEye,
                            TaperSteps = new[] { 4, 3, 2, 1 }.Select(times => new TaperStep
                            {
                                Frequency = "daily", FrequencyValue = times, DurationValue = 1, DurationUnit = "weeks",
                            }).ToList(),
                        },
                    },
                ],
            });
            await db.SaveChangesAsync();
            return true;
        }
    }

    /// <summary>
    /// The shared catalog is loaded (<see cref="CatalogScript"/> run): the template sample's shared drug and the Eye
    /// category exist.
    /// </summary>
    private async Task<bool> CatalogLoadedAsync() =>
        await db.Drugs.AnyAsync(d => d.ClinicId == null && d.Name == SampleSharedDrugName && !d.IsWithdrawn)
        && await db.Categories.AnyAsync(c => c.Id == CategoryIds.Eye);

    /// <summary>
    /// "Demo clinic" (the template copy, the assistant as Assistant) and "Second demo clinic" (the template copy, a
    /// read-only "Viewer" role, the assistant as Viewer), both owned by the dev owner. Paging and search are checked on
    /// the shared catalog (23K drugs): no bulk drugs.
    /// </summary>
    private async Task SeedDemoClinicsAsync(string ownerPhone, string assistantPhone)
    {
        var assistant = assistantPhone is null ? null : await userAccounts.GetOrCreateAsync(assistantPhone);

        var demoId = await CreateClinicAsync(DemoClinicName, ownerPhone);
        using (clinicScope.Use(demoId))
        {
            // No deletes
            AddAssistant(assistant, await db.Roles.SingleAsync(r => r.Name == DefaultRoles.Assistant));
            await db.SaveChangesAsync();
        }
        db.ChangeTracker.Clear();

        var secondId = await CreateClinicAsync(SecondDemoClinicName, ownerPhone);
        using (clinicScope.Use(secondId))
        {
            // A custom read-only role: no add, edit, delete, nor the prescription page
            var viewer = new Role
            {
                Name = DevViewerRoleName,
                Permissions = new[] { Permissions.Drugs.List, Permissions.Drugs.Details, Permissions.Protocols.List, Permissions.Protocols.Details }
                    .Select(p => new RolePermission { Permission = p }).ToList(),
            };
            db.Roles.Add(viewer);
            AddAssistant(assistant, viewer);
            await db.SaveChangesAsync();
        }
    }

    /// <summary>Provisions a clinic exactly like the admin screen does (<see cref="CreateClinicCommand"/>).</summary>
    private async Task<int> CreateClinicAsync(string name, string ownerPhone)
    {
        var result = await sender.Send(new CreateClinicCommand(name, new CreateClinicOwner(ownerPhone, DevOwnerName)));
        return result.IsSuccess
            ? result.Data.Id
            : throw new InvalidOperationException(
                $"Dev seed: creating '{name}' failed: {string.Join(", ", result.Errors.Select(e => e.Code))}.");
    }

    private string DevPhone(string phone, string setting) =>
        string.IsNullOrWhiteSpace(phone) ? null : ConfigPhones.Normalize(phoneNormalizer, phone, platform.DefaultRegion, setting);

    /// <summary>The dev assistant (none when <c>DevAssistantPhone</c> is empty or the owner's) as staff with <paramref name="role"/>.</summary>
    private void AddAssistant(User assistant, Role role)
    {
        if (assistant is not null)
            db.Staff.Add(new Staff { UserId = assistant.Id, FullName = DevAssistantName, Roles = [new StaffRole { Role = role }] });
    }
}
