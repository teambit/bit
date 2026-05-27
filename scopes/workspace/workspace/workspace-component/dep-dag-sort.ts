import type { ComponentID } from '@teambit/component-id';

/**
 * Topologically layer a set of items by dependency depth.
 *
 * Layer 0 is "deepest" — items that nothing else in the input depends on
 * (or whose deps aren't in the input). They load first. Layer N is items
 * whose deps are at most N hops away in the input.
 *
 * Cycles are not expected for component DAGs (envs, extensions). If one is
 * detected, the function returns a single layer containing all items —
 * defensive against infinite recursion, never silently produces partial output.
 *
 * @param items  the items to layer
 * @param keyOf  primary lookup key for an item (typically `id.toString()`)
 * @param keyVariantsOf  alternative keys an item may be referenced by
 *                       (e.g. `[id.toString(), id.toStringWithoutVersion()]`)
 * @param getDepKeys  for an item, return the keys of its dependencies. Keys not
 *                    present in the input are ignored. May return any of the
 *                    variants accepted by `keyVariantsOf`.
 */
export function topoLayerByDeps<T>(
  items: T[],
  keyOf: (item: T) => string,
  keyVariantsOf: (item: T) => string[],
  getDepKeys: (item: T) => string[]
): T[][] {
  if (items.length === 0) return [];

  const itemByKey = new Map<string, T>();
  for (const item of items) {
    for (const variant of keyVariantsOf(item)) itemByKey.set(variant, item);
  }

  // For each item, the subset of its declared deps that are present in the input.
  const depsInInput = new Map<string, T[]>();
  for (const item of items) {
    const deps = getDepKeys(item)
      .map((depKey) => itemByKey.get(depKey))
      .filter((dep): dep is T => dep !== undefined && dep !== item);
    depsInInput.set(keyOf(item), deps);
  }

  const depthCache = new Map<string, number>();
  const inProgress = new Set<string>();
  let cycleDetected = false;

  const computeDepth = (item: T): number => {
    const k = keyOf(item);
    const cached = depthCache.get(k);
    if (cached !== undefined) return cached;
    if (inProgress.has(k)) {
      cycleDetected = true;
      return 0;
    }
    inProgress.add(k);
    const deps = depsInInput.get(k) ?? [];
    let maxDepDepth = -1;
    for (const dep of deps) {
      const d = computeDepth(dep);
      if (d > maxDepDepth) maxDepDepth = d;
    }
    inProgress.delete(k);
    const depth = maxDepDepth + 1;
    depthCache.set(k, depth);
    return depth;
  };

  for (const item of items) computeDepth(item);
  if (cycleDetected) return [items];

  const byDepth = new Map<number, T[]>();
  let maxDepth = 0;
  for (const item of items) {
    const d = depthCache.get(keyOf(item))!;
    if (d > maxDepth) maxDepth = d;
    if (!byDepth.has(d)) byDepth.set(d, []);
    byDepth.get(d)!.push(item);
  }

  const layers: T[][] = [];
  for (let d = 0; d <= maxDepth; d++) {
    const layer = byDepth.get(d);
    if (layer && layer.length > 0) layers.push(layer);
  }
  return layers;
}

const componentIdKeyVariants = (id: ComponentID): string[] => [id.toString(), id.toStringWithoutVersion()];

/**
 * Layer extension IDs by extension-of-extension depth.
 *
 * Example: compA's extensions list contains extA. extA's own extensions list
 * contains extB. Loading order: extB → extA → compA. This function takes the
 * input `[extA, extB]` and returns `[[extB], [extA]]` so the caller can load
 * each layer in turn.
 *
 * @param extIds       the extensions to layer
 * @param getExtsOfExt for an extension, return the string ids of its own extensions
 *                     (with-version or without-version both accepted)
 */
export function groupExtsByDepLayer(
  extIds: ComponentID[],
  getExtsOfExt: (id: ComponentID) => string[]
): ComponentID[][] {
  return topoLayerByDeps(
    extIds,
    (id) => id.toString(),
    componentIdKeyVariants,
    (id) => getExtsOfExt(id)
  );
}
