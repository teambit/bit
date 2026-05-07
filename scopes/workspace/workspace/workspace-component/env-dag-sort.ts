import type { ComponentID } from '@teambit/component-id';

/**
 * Topologically layer env IDs by env-of-env depth.
 *
 * Returns layers in load order: layer 0 is "deepest" (no env-of-env among the
 * input list) and must load first; layer N is "shallowest" and loads last.
 *
 * Example:
 *   envIds: [ReactEnv, BitEnv]
 *   ReactEnv's env is BitEnv, BitEnv's env is not in the list
 *   → [[BitEnv], [ReactEnv]] (load BitEnv first)
 *
 *   envIds: [A, B, C]
 *   A's env is B, B's env is C, C's env is not in the list
 *   → [[C], [B], [A]] (load C, then B, then A)
 *
 *   envIds: [A, B] with no env-of-env relationships in the list
 *   → [[A, B]] (single layer)
 *
 * Quirk preserved from V1's `regroupEnvsIdsFromTheList`: when an env in the
 * input list is itself used directly by a workspace component
 * (`envsIdsOfWsComps`), its env-of-env edge is *not* propagated. The original
 * intent is unclear from history; preserved as-is to avoid behavioral drift.
 * Document the rationale before the next refactor touches it.
 *
 * Cycles are not expected in real env DAGs. If one is detected, the function
 * returns all envs in a single layer (defensive — better than infinite recursion).
 *
 * @param envIds  the envs to layer (typically, envs used by workspace components)
 * @param getEnvOfEnv  lookup: given an env, return the string id of ITS env (or undefined)
 * @param envsIdsOfWsComps  set of env id strings used directly by workspace components
 * @returns layers in load order — `result[0]` loads first
 */
export function groupEnvsByDepLayer(
  envIds: ComponentID[],
  getEnvOfEnv: (id: ComponentID) => string | undefined,
  envsIdsOfWsComps: Set<string>
): ComponentID[][] {
  if (envIds.length === 0) return [];

  // Index input by both with-version and without-version, since lookups in V1
  // matched both forms.
  const idIndex = new Map<string, ComponentID>();
  for (const id of envIds) {
    idIndex.set(id.toString(), id);
    idIndex.set(id.toStringWithoutVersion(), id);
  }

  // For each env, its env-of-env *if that env is also in the input list*. Otherwise null.
  const dependsOn = new Map<string, ComponentID | null>();
  for (const id of envIds) {
    const idStr = id.toString();
    if (envsIdsOfWsComps.has(idStr)) {
      // Quirk: skip propagating the env-of-env edge when this env is a ws-comp env.
      dependsOn.set(idStr, null);
      continue;
    }
    const envOfEnvId = getEnvOfEnv(id);
    const target = envOfEnvId ? idIndex.get(envOfEnvId) : undefined;
    dependsOn.set(idStr, target ?? null);
  }

  // Compute depth via memoized DFS, with cycle detection.
  const depthCache = new Map<string, number>();
  const inProgress = new Set<string>();
  let cycleDetected = false;

  function depth(id: ComponentID): number {
    const idStr = id.toString();
    if (depthCache.has(idStr)) return depthCache.get(idStr)!;
    if (inProgress.has(idStr)) {
      cycleDetected = true;
      return 0;
    }
    inProgress.add(idStr);
    const dep = dependsOn.get(idStr);
    const d = dep ? 1 + depth(dep) : 0;
    inProgress.delete(idStr);
    depthCache.set(idStr, d);
    return d;
  }

  for (const id of envIds) depth(id);
  if (cycleDetected) return [envIds];

  // Group by depth.
  const byDepth = new Map<number, ComponentID[]>();
  let maxDepth = 0;
  for (const id of envIds) {
    const d = depthCache.get(id.toString())!;
    if (d > maxDepth) maxDepth = d;
    if (!byDepth.has(d)) byDepth.set(d, []);
    byDepth.get(d)!.push(id);
  }

  // Emit ascending: depth 0 (deepest, must load first) → depth maxDepth (loads last).
  const layers: ComponentID[][] = [];
  for (let d = 0; d <= maxDepth; d++) {
    const layer = byDepth.get(d);
    if (layer && layer.length > 0) layers.push(layer);
  }
  return layers;
}
