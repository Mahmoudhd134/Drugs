using System.Diagnostics;
using ClinicHub.Application.Common.Abstractions;
using ClinicHub.Application.Common.Settings;
using ClinicHub.Application.Features.Access;
using ClinicHub.Application.Features.Access.Roles;
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
    /// The smallest content that proves the copy (design D6): two drugs with default dosings and one group using
    /// both, one line overriding its drug's dosing (a tapering schedule, the eye asked when the group is added).
    /// Skipped (false) when the template already has drugs (e.g. added by hand, or seeded on an earlier start
    /// while <c>DevOwnerPhone</c> was empty).
    /// </summary>
    private async Task<bool> SeedTemplateAsync()
    {
        var templateId = await db.Clinics.Where(c => c.IsTemplate).Select(c => c.Id).FirstAsync();
        using (clinicScope.Use(templateId))
        {
            if (await db.Drugs.AnyAsync())
                return false;

            var antibiotic = new Drug
            {
                Name = "Moxifloxacin 0.5%",
                Description = "Antibiotic eye drops",
                DefaultDosing = new Dosing
                {
                    DoseAmount = 1, DoseUnit = "drop", Frequency = "daily", FrequencyValue = 4,
                    DurationValue = 1, DurationUnit = "weeks",
                },
            };
            var steroid = new Drug
            {
                Name = "Prednisolone acetate 1%",
                Description = "Steroid eye drops",
                DefaultDosing = new Dosing
                {
                    DoseAmount = 1, DoseUnit = "drop", Frequency = "daily", FrequencyValue = 4,
                    DurationValue = 4, DurationUnit = "weeks",
                },
            };
            db.Drugs.AddRange(antibiotic, steroid);
            await db.SaveChangesAsync();

            db.DrugGroups.Add(new DrugGroup
            {
                Name = "After cataract surgery",
                Items =
                [
                    // The drug's default dosing as is
                    new DrugGroupItem { DrugId = antibiotic.Id, Order = 0 },
                    // Override: taper 4 → 1 times a day over 4 weeks; the dose comes from the drug
                    new DrugGroupItem
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
    /// "Demo clinic" (the template copy + 10,000 drugs, the assistant as Assistant) and "Second demo clinic" (the
    /// template copy, a read-only "Viewer" role, the assistant as Viewer), both owned by the dev owner.
    /// </summary>
    private async Task SeedDemoClinicsAsync(string ownerPhone, string assistantPhone)
    {
        var assistant = assistantPhone is null ? null : await userAccounts.GetOrCreateAsync(assistantPhone);

        var demoId = await CreateClinicAsync(DemoClinicName, ownerPhone);
        using (clinicScope.Use(demoId))
        {
            // For paging and search checks
            db.Drugs.AddRange(Enumerable.Range(1, 10000).Select(x => new Drug
            {
                Name = $"Drug number {x}",
                Description = $"Description of drug number {x}",
            }));
            // No deletes
            AddAssistant(assistant, await db.Roles.SingleAsync(r => r.Name == DefaultRoles.Assistant));
            await db.SaveChangesAsync();
        }
        // Don't keep the 10,000 drugs tracked through the next clinic's saves
        db.ChangeTracker.Clear();

        var secondId = await CreateClinicAsync(SecondDemoClinicName, ownerPhone);
        using (clinicScope.Use(secondId))
        {
            // A custom read-only role: no add, edit, delete, nor the prescription page
            var viewer = new Role
            {
                Name = DevViewerRoleName,
                Permissions = new[] { Permissions.Drugs.List, Permissions.Drugs.Details, Permissions.Groups.List, Permissions.Groups.Details }
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
