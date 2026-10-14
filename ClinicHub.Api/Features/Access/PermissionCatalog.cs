using System.Reflection;
using System.Text.RegularExpressions;

namespace ClinicHub.Api.Features.Access;

/// <param name="Key">e.g. <c>drugs.update</c></param>
/// <param name="Resource">e.g. <c>drugs</c></param>
/// <param name="Action">e.g. <c>update</c></param>
/// <param name="Requires">Permissions this one needs to be useful (direct ones only).</param>
public sealed record PermissionDefinition(string Key, string Resource, string Action, IReadOnlyList<string> Requires);

/// <summary>
/// The permission catalog, read once from the constants in <see cref="Permissions"/> (in declaration
/// order) and validated: keys are unique <c>resource.action</c> and every requirement is a known key.
/// </summary>
public static partial class PermissionCatalog
{
    public static readonly IReadOnlyList<PermissionDefinition> All = Build();

    private static readonly Dictionary<string, PermissionDefinition> ByKey = All.ToDictionary(p => p.Key);

    /// <summary>Every key, for "all permissions" (Owner).</summary>
    public static readonly IReadOnlySet<string> Keys = ByKey.Keys.ToHashSet();

    public static bool IsKnown(string key) => key is not null && ByKey.ContainsKey(key);

    /// <summary>The catalog grouped by resource, in declaration order (the role editor's sections).</summary>
    public static IReadOnlyList<IGrouping<string, PermissionDefinition>> ByResource() =>
        All.GroupBy(p => p.Resource).ToList();

    /// <summary>The known keys plus everything they need, transitively (unknown keys are dropped).</summary>
    public static IReadOnlySet<string> WithRequirements(IEnumerable<string> keys)
    {
        var result = new HashSet<string>();
        var pending = new Stack<string>(keys.Where(IsKnown));
        while (pending.TryPop(out var key))
            if (result.Add(key))
                foreach (var required in ByKey[key].Requires)
                    pending.Push(required);
        return result;
    }

    [GeneratedRegex(@"^[a-z][a-zA-Z]*\.[a-z][a-zA-Z]*$")]
    private static partial Regex KeyFormat();

    private static List<PermissionDefinition> Build()
    {
        var definitions = typeof(Permissions).GetNestedTypes(BindingFlags.Public)
            .SelectMany(type => type.GetFields(BindingFlags.Public | BindingFlags.Static)
                .Where(f => f.IsLiteral && f.FieldType == typeof(string))
                .Select(f => (Key: (string)f.GetRawConstantValue(), Requires: f.GetCustomAttribute<RequiresAttribute>()?.Permissions ?? [])))
            .Select(x =>
            {
                if (!KeyFormat().IsMatch(x.Key))
                    throw new InvalidOperationException($"Permission '{x.Key}' must be named resource.action.");
                var dot = x.Key.IndexOf('.');
                return new PermissionDefinition(x.Key, x.Key[..dot], x.Key[(dot + 1)..], x.Requires);
            })
            .ToList();

        var keys = new HashSet<string>();
        foreach (var definition in definitions.Where(d => !keys.Add(d.Key)))
            throw new InvalidOperationException($"Permission '{definition.Key}' is declared twice.");
        foreach (var definition in definitions)
            foreach (var required in definition.Requires.Where(r => !keys.Contains(r) || r == definition.Key))
                throw new InvalidOperationException($"Permission '{definition.Key}' requires unknown or itself: '{required}'.");
        return definitions;
    }
}
