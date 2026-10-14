using ClinicHub.Domain.Access;
using ClinicHub.Infrastructure.Database;

namespace ClinicHub.Api.Features.Access;

/// <summary>
/// The roles every clinic starts with (HLD 6). Used by the dev seed and, in phase 4, by clinic
/// provisioning. Role names are clinic data (not translated), like drug names.
/// </summary>
public static class DefaultRoles
{
    public const string Owner = "Owner";
    public const string Doctor = "Doctor";
    public const string Assistant = "Assistant";

    private static readonly string[] AssistantDenied = [Permissions.Drugs.Delete, Permissions.Groups.Delete];

    /// <summary>Name → permissions; null = the Owner role (every permission, no rows).</summary>
    public static readonly IReadOnlyList<(string Name, IReadOnlyList<string> Permissions)> Templates =
    [
        (Owner, null),
        (Doctor, PermissionCatalog.All.Select(p => p.Key).ToList()),
        (Assistant, PermissionCatalog.All.Select(p => p.Key).Except(AssistantDenied).ToList()),
    ];

    /// <summary>
    /// Creates the default roles in a clinic and saves them; returns them by name. The request's
    /// clinic context must already be that clinic (the save interceptor refuses any other).
    /// </summary>
    public static async Task<IReadOnlyDictionary<string, Role>> SeedAsync(AppDbContext db, int clinicId,
        CancellationToken cancellationToken = default)
    {
        if (db.ClinicId != clinicId)
            throw new InvalidOperationException($"Set the clinic context to clinic {clinicId} before seeding its roles.");

        var roles = Templates.Select(t => new Role
        {
            ClinicId = clinicId,
            Name = t.Name,
            IsOwner = t.Permissions is null,
            Permissions = (t.Permissions ?? []).Select(p => new RolePermission { Permission = p }).ToList(),
        }).ToList();
        db.Roles.AddRange(roles);
        await db.SaveChangesAsync(cancellationToken);
        return roles.ToDictionary(r => r.Name);
    }
}
