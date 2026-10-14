// A part of Access's Permissions class, so it shares its namespace
namespace ClinicHub.Application.Features.Access;

public static partial class Permissions
{
    [PermissionModule("catalog")]
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

    [PermissionModule("catalog")]
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
}
