// A part of Access's Permissions class, so it shares its namespace
namespace ClinicHub.Application.Features.Access;

public static partial class Permissions
{
    [PermissionModule("prescription")]
    public static class Prescriptions
    {
        /// <summary>The prescription page; picking needs the drug list (the group picker also needs groups.list).</summary>
        [Requires(Drugs.List)] public const string Create = "prescriptions.create";
    }
}
