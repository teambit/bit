import type { ComponentID } from '@teambit/component-id';

/**
 * Group env IDs into layers ordered by env-of-env depth.
 *
 * Returns `[deeper, shallower]`:
 * - `deeper` — envs that are referenced as the env-of-env by some other env in
 *   the input list. They must load first because envs that depend on them load next.
 * - `shallower` — envs not referenced as env-of-env by anyone else in the list.
 *
 * **Behavior-preserving extraction** of the algorithm previously inlined as
 * `WorkspaceComponentLoader.regroupEnvsIdsFromTheList`. Quirks preserved:
 *
 * 1. Only one level of layering (envs of envs of envs is *not* handled — the
 *    deeper grouping isn't recursively split). See D-001 in
 *    `docs/rfcs/component-loading-rewrite/DECISIONS.md` for why and the plan
 *    to fix it.
 * 2. The `envsIdsOfWsComps` filter: when an env in the input list is itself
 *    used directly by a workspace component, we don't propagate its
 *    env-of-env relationship into the deeper-layer set. The original intent
 *    is unclear from history; preserved as-is to avoid behavioral drift.
 *    Document the rationale before the next refactor touches it.
 *
 * @param envIds  the envs to layer (typically, envs used by workspace components)
 * @param getEnvOfEnv  lookup: given an env, return the string id of ITS env (or undefined)
 * @param envsIdsOfWsComps  set of env id strings used directly by workspace components
 * @returns `[deeper, shallower]` — load `deeper` first
 */
export function groupEnvsByDepLayer(
  envIds: ComponentID[],
  getEnvOfEnv: (id: ComponentID) => string | undefined,
  envsIdsOfWsComps: Set<string>
): [ComponentID[], ComponentID[]] {
  const envsOfEnvs = new Set<string>();
  for (const envId of envIds) {
    const idStr = envId.toString();
    if (envsIdsOfWsComps.has(idStr)) continue;
    const envOfEnvId = getEnvOfEnv(envId);
    if (envOfEnvId) envsOfEnvs.add(envOfEnvId);
  }
  const deeper: ComponentID[] = [];
  const shallower: ComponentID[] = [];
  for (const id of envIds) {
    if (envsOfEnvs.has(id.toString()) || envsOfEnvs.has(id.toStringWithoutVersion())) {
      deeper.push(id);
    } else {
      shallower.push(id);
    }
  }
  return [deeper, shallower];
}
