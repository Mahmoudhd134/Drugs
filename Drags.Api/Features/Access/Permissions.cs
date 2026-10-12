namespace Drags.Api.Features.Access;

/// <summary>
/// Every permission, one per action, named <c>resource.action</c> (HLD 6). This file is the single
/// source of truth: <see cref="PermissionCatalog"/> is built from it, so adding a permission is one
/// constant here (plus its labels under <c>permissions.*</c> in the SPA locales). Put the permissions
/// it needs in <see cref="RequiresAttribute"/>.
/// Keep in sync with Drags.Web/src/features/access/permissions.ts.
/// </summary>
public static class Permissions
{
    public static class Drugs
    {
        /// <summary>Drugs list and search (also the drug picker).</summary>
        public const string List = "drugs.list";
        /// <summary>Open one drug, see which groups use it.</summary>
        [Requires(List)] public const string Details = "drugs.details";
        [Requires(List)] public const string Create = "drugs.create";
        [Requires(Details)] public const string Update = "drugs.update";
        /// <summary>Needs the details to warn about the groups using the drug.</summary>
        [Requires(Details)] public const string Delete = "drugs.delete";
    }

    public static class Groups
    {
        /// <summary>Groups list and search (also the group picker).</summary>
        public const string List = "groups.list";
        /// <summary>Open one group.</summary>
        [Requires(List)] public const string Details = "groups.details";
        /// <summary>Needs the drug list to pick the group's drugs.</summary>
        [Requires(List, Drugs.List)] public const string Create = "groups.create";
        /// <summary>Name, drugs, order and dosing.</summary>
        [Requires(Details, Drugs.List)] public const string Update = "groups.update";
        [Requires(List)] public const string Delete = "groups.delete";
    }

    public static class Prescriptions
    {
        /// <summary>The prescription page; picking needs the drug list (the group picker also needs groups.list).</summary>
        [Requires(Drugs.List)] public const string Create = "prescriptions.create";
    }
}

/// <summary>The permissions a permission is useless without (e.g. editing a drug needs opening it).</summary>
[AttributeUsage(AttributeTargets.Field)]
public sealed class RequiresAttribute(params string[] permissions) : Attribute
{
    public IReadOnlyList<string> Permissions { get; } = permissions;
}
