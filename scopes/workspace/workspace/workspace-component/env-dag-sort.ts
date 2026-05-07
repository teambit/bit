import type { ComponentID } from '@teambit/component-id';
import { topoLayerByDeps } from './dep-dag-sort';

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
  return topoLayerByDeps(
    envIds,
    (id) => id.toString(),
    (id) => [id.toString(), id.toStringWithoutVersion()],
    (id) => {
      // Quirk: skip propagating the env-of-env edge when this env is a ws-comp env.
      if (envsIdsOfWsComps.has(id.toString())) return [];
      const envOfEnv = getEnvOfEnv(id);
      return envOfEnv ? [envOfEnv] : [];
    }
  );
}
