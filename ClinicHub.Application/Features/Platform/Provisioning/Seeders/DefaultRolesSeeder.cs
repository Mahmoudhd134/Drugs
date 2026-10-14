using ClinicHub.Application.Common.Abstractions;
using ClinicHub.Application.Features.Access.Roles;
using ClinicHub.Domain.Access;

namespace ClinicHub.Application.Features.Platform.Provisioning.Seeders;

/// <summary>
/// Step 10: the default roles (<see cref="DefaultRoles"/>: Owner, Doctor, Assistant) with their permissions.
/// Their clinic is the current one (filled on insert).
/// </summary>
internal sealed class DefaultRolesSeeder(IAppDbContext db) : IClinicSeeder
{
    public int Order => 10;

    public async Task SeedAsync(ClinicSeedContext context, CancellationToken cancellationToken)
    {
        db.Roles.AddRange(DefaultRoles.Templates.Select(t => new Role
        {
            Name = t.Name,
            IsOwner = t.Permissions is null,
            Permissions = (t.Permissions ?? []).Select(p => new RolePermission { Permission = p }).ToList(),
        }));
        await db.SaveChangesAsync(cancellationToken);
    }
}
