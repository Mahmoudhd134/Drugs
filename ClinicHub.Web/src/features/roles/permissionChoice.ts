import type {PermissionDefinition} from "../access/api.ts";

/**
 * The role editor's rules (design D8, like `PermissionCatalog.WithRequirements` on the API): the ticked set always holds
 * what its permissions require, so ticking one adds its requirements (transitively), and a requirement of a ticked
 * permission can't be unticked.
 */

const byKey = (catalog: readonly PermissionDefinition[]) => new Map(catalog.map(p => [p.key, p]));

/** `keys` plus everything they require, transitively; only catalog keys, in catalog order. */
export const withRequirements = (catalog: readonly PermissionDefinition[], keys: Iterable<string>): string[] => {
    const definitions = byKey(catalog);
    const result = new Set<string>();
    const pending = [...keys];
    while (pending.length) {
        const key = pending.pop()!;
        const definition = definitions.get(key);
        if (!definition || result.has(key)) continue;
        result.add(key);
        pending.push(...definition.requires);
    }
    return catalog.filter(p => result.has(p.key)).map(p => p.key);
};

/**
 * The ticked permissions that directly require `key` (catalog order): while any is ticked, `key` stays ticked. Direct
 * ones are enough, the ticked set being closed (a permission requiring it through another one requires that one).
 */
export const requiredBy = (catalog: readonly PermissionDefinition[], ticked: ReadonlySet<string>, key: string) =>
    catalog.filter(p => ticked.has(p.key) && p.requires.includes(key));

/** Ticks `key` with its requirements, or unticks it (only when nothing ticked requires it). */
export const toggle = (catalog: readonly PermissionDefinition[], ticked: ReadonlySet<string>, key: string): string[] =>
    ticked.has(key)
        ? requiredBy(catalog, ticked, key).length ? [...ticked] : [...ticked].filter(k => k !== key)
        : withRequirements(catalog, [...ticked, key]);

/** The catalog grouped for the editor: modules, then their resources, in catalog order. */
export const groupCatalog = (catalog: readonly PermissionDefinition[]) => {
    const modules: { module: string; resources: { resource: string; permissions: PermissionDefinition[] }[] }[] = [];
    for (const permission of catalog) {
        let module = modules.find(m => m.module === permission.module);
        if (!module) modules.push(module = {module: permission.module, resources: []});
        let resource = module.resources.find(r => r.resource === permission.resource);
        if (!resource) module.resources.push(resource = {resource: permission.resource, permissions: []});
        resource.permissions.push(permission);
    }
    return modules;
};
