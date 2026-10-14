namespace ClinicHub.Application.Features.Access;

/// <summary>
/// Every permission, one per action, named <c>resource.action</c> (HLD 6). A partial class: each module
/// declares its resources in its own file next to its use cases (<c>Features/Catalog/CatalogPermissions.cs</c>…),
/// one nested class per resource with <see cref="PermissionModuleAttribute"/>. These constants are the single
/// source of truth: <see cref="PermissionCatalog"/> is built from them, so adding a permission is one
/// constant (plus its labels under <c>permissions.*</c> in the SPA locales). Put the permissions it needs
/// in <see cref="RequiresAttribute"/>.
/// Keep in sync with ClinicHub.Web/src/features/access/permissions.ts.
/// </summary>
public static partial class Permissions;

/// <summary>The permissions a permission is useless without (e.g. editing a drug needs opening it).</summary>
[AttributeUsage(AttributeTargets.Field)]
public sealed class RequiresAttribute(params string[] permissions) : Attribute
{
    public IReadOnlyList<string> Permissions { get; } = permissions;
}

/// <summary>
/// The module a resource class of <see cref="Permissions"/> belongs to (<c>catalog</c>, <c>prescription</c>…):
/// a grouping for the catalog and the role editor only; keys stay <c>resource.action</c>.
/// </summary>
[AttributeUsage(AttributeTargets.Class)]
public sealed class PermissionModuleAttribute(string module) : Attribute
{
    public string Module { get; } = module;
}
