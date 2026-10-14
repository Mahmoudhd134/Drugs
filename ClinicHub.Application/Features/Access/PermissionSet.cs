namespace ClinicHub.Application.Features.Access;

/// <summary>The caller's permissions in the request's clinic: known keys only, expanded (Owner = every key).</summary>
public sealed class PermissionSet
{
    public static readonly PermissionSet None = new(new HashSet<string>(), false);
    public static readonly PermissionSet All = new(PermissionCatalog.Keys, true);

    private PermissionSet(IReadOnlySet<string> keys, bool isAll)
    {
        Keys = keys;
        IsAll = isAll;
    }

    /// <summary>
    /// The union of role permissions plus what they require (<see cref="RequiresAttribute"/>), so e.g.
    /// <c>drugs.update</c> also grants <c>drugs.details</c>; keys no longer in the catalog are dropped.
    /// </summary>
    public static PermissionSet Of(IEnumerable<string> keys) => new(PermissionCatalog.WithRequirements(keys), false);

    /// <summary>Every permission (Owner, or the super admin in the template clinic).</summary>
    public bool IsAll { get; }

    public IReadOnlySet<string> Keys { get; }

    public bool Has(string permission) => Keys.Contains(permission);
    public bool HasAll(params string[] permissions) => permissions.All(Has);
    public bool HasAny(params string[] permissions) => permissions.Any(Has);

    /// <summary>The keys in catalog order (for <c>/me</c>).</summary>
    public List<string> ToList() => PermissionCatalog.All.Select(p => p.Key).Where(Has).ToList();
}
