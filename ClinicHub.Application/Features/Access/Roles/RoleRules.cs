using System.Globalization;
using ClinicHub.Application.Features.Access.Authorization;
using ClinicHub.Domain.Access;
using Microsoft.EntityFrameworkCore;

namespace ClinicHub.Application.Features.Access.Roles;

/// <summary>
/// Pure helpers shared by the role and staff commands: query pieces they compose (the handlers run them; the query
/// filter keeps them to the current clinic) and in-memory rules. Nothing here runs a query.
/// </summary>
internal static class RoleRules
{
    /// <summary>
    /// Roles named <paramref name="name"/> (already trimmed), case-insensitive: the stored name lowered by the database
    /// (<c>lower()</c>), the new one lowered here (invariant culture). They agree for Latin and Arabic names; a few
    /// special letters (e.g. Turkish "İ") may fold differently (accepted: no provider-specific function in
    /// Application). Stricter than the unique <c>(ClinicId, Name)</c> index (exact): "doctor" next to "Doctor" is
    /// refused, and the index only catches two saves of the same name in the same instant (accepted race: 500, works
    /// when sent again).
    /// </summary>
    public static IQueryable<Role> WithName(this IQueryable<Role> roles, string name)
    {
        var lowered = name.ToLowerInvariant();
        return roles.Where(r => r.Name.ToLower() == lowered);
    }

    /// <summary>
    /// True when <paramref name="name"/> reads like the Owner role as the SPA shows it, in any language
    /// (<see cref="DefaultRoles.OwnerLabels"/>): compared case-insensitively (ordinal) after
    /// <see cref="WithoutInvisibleMarks"/> and trimming, so "OWNER", «المالك» with an RLM or a tatweel, or «المالِك» are
    /// caught. Another role can't take it (<see cref="RoleErrors.NameTaken"/>), even where the stored "Owner" would not
    /// match (the Arabic label). Look-alike letters of other scripts (a Cyrillic "е" in "Owner") are not caught
    /// (accepted: only the super admin names roles).
    /// </summary>
    public static bool IsOwnerLabel(string name)
    {
        var plain = WithoutInvisibleMarks(name).Trim();
        return DefaultRoles.OwnerLabels.Any(label => string.Equals(label, plain, StringComparison.OrdinalIgnoreCase));
    }

    /// <summary>
    /// The name without what doesn't change how it reads: Unicode format characters (category Cf: LRM/RLM, ZWSP,
    /// ZWJ/ZWNJ, BOM, soft hyphen…), non-spacing marks (category Mn: every combining mark, e.g. the Arabic tashkeel
    /// U+064B–U+065F) and the Arabic tatweel (U+0640). The superscript (dagger) alef U+0670, also a mark, stands for an
    /// alef («المٰلك» reads «المالك»), so it becomes one instead of being dropped.
    /// </summary>
    public static string WithoutInvisibleMarks(string name) =>
        new(name.Replace(SuperscriptAlef, Alef)
            .Where(c => char.GetUnicodeCategory(c) is not (UnicodeCategory.Format or UnicodeCategory.NonSpacingMark)
                        && c != Tatweel).ToArray());

    private const char Tatweel = (char)0x0640;
    private const char SuperscriptAlef = (char)0x0670;
    private const char Alef = (char)0x0627;

    /// <summary>The roles of these ids (duplicates in <paramref name="ids"/> are ignored by <c>IN</c>).</summary>
    public static IQueryable<Role> WithIds(this IQueryable<Role> roles, IReadOnlyCollection<int> ids) =>
        roles.Where(r => ids.Contains(r.Id));

    /// <summary>
    /// Makes the role's rows exactly the picked keys plus everything they require (design D8), keeping the unchanged
    /// ones. True when a row was added or removed.
    /// </summary>
    public static bool SetPermissions(Role role, IEnumerable<string> picked)
    {
        var keys = PermissionCatalog.WithRequirements(picked);
        var removed = role.Permissions.RemoveAll(p => !keys.Contains(p.Permission));
        var kept = role.Permissions.Select(p => p.Permission).ToHashSet();
        var added = keys.Where(k => !kept.Contains(k)).Select(k => new RolePermission { Permission = k }).ToList();
        role.Permissions.AddRange(added);
        return removed > 0 || added.Count > 0;
    }
}
