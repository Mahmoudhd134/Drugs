using ClinicHub.Application.Common.Abstractions;
using ClinicHub.Application.Features.Identity.Users;
using ClinicHub.Domain.Access;
using Microsoft.EntityFrameworkCore;

namespace ClinicHub.Application.Features.Platform.Provisioning.Seeders;

/// <summary>
/// Step 20: the owner's user, found by phone or created (an existing user is reused and gets one more
/// clinic), as staff with the Owner role seeded by step 10.
/// </summary>
internal sealed class OwnerSeeder(IAppDbContext db, IUserAccounts userAccounts) : IClinicSeeder
{
    public int Order => 20;

    public async Task SeedAsync(ClinicSeedContext context, CancellationToken cancellationToken)
    {
        var user = await userAccounts.GetOrCreateAsync(context.OwnerPhone, cancellationToken);
        // The current clinic's (query filter); one Owner role per clinic (unique index)
        var ownerRole = await db.Roles.SingleAsync(r => r.IsOwner, cancellationToken);
        db.Staff.Add(new Staff
        {
            UserId = user.Id,
            FullName = context.OwnerName,
            Roles = [new StaffRole { Role = ownerRole }],
        });
        await db.SaveChangesAsync(cancellationToken);
    }
}
