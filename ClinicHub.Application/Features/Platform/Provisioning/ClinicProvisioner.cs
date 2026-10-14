using ClinicHub.Application.Common.Abstractions;
using ClinicHub.Application.Features.Platform.Clinics;
using ClinicHub.Domain.Platform;
using Microsoft.EntityFrameworkCore;

namespace ClinicHub.Application.Features.Platform.Provisioning;

/// <inheritdoc />
internal sealed class ClinicProvisioner(IAppDbContext db, IClinicScope clinicScope, IEnumerable<IClinicSeeder> seeders)
    : IClinicProvisioner
{
    public async Task<ClinicDetails> ProvisionAsync(string name, string ownerPhone, string ownerName,
        CancellationToken cancellationToken)
    {
        // Not clinic-owned: saved without a current clinic
        var clinic = new Clinic { Name = name };
        db.Clinics.Add(clinic);
        await db.SaveChangesAsync(cancellationToken);

        var context = new ClinicSeedContext(clinic.Id, ownerPhone, ownerName);
        using (clinicScope.Use(clinic.Id))
        {
            foreach (var seeder in seeders.OrderBy(s => s.Order))
                await seeder.SeedAsync(context, cancellationToken);

            // Same transaction: the clinic and its owner are there
            return await db.Clinics.AsNoTracking()
                .Where(c => c.Id == clinic.Id)
                .SelectDetails(db)
                .FirstAsync(cancellationToken);
        }
    }
}
