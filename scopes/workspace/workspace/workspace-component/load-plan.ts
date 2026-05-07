import type { ComponentID } from '@teambit/component-id';
import { groupEnvsByDepLayer } from './env-dag-sort';
import { groupExtsByDepLayer } from './dep-dag-sort';

/**
 * What the pure load-plan builder needs to know about a component.
 * The caller is responsible for populating this view of the world (typically
 * by warming caches before calling `buildLoadPlanGroups`).
 */
export interface LoadPlanInput {
  /** Components present in the workspace, in the order the caller wants them processed. */
  workspaceIds: ComponentID[];
  /** Components present only in scope. */
  scopeIds: ComponentID[];
  /** Returns true for components that are core envs (no loading required). */
  isCoreEnv: (id: ComponentID) => boolean;
  /**
   * The extensions list configured on `id` — `stringId` is the aspect string id
   * (with version, as written in config); `newExtensionId` is the resolved
   * ComponentID of that extension's component, when known.
   */
  extensionsOf: (id: ComponentID) => Array<{ stringId: string; newExtensionId?: ComponentID }>;
  /** The env id (with version) configured on `id`, if any. */
  envIdOf: (id: ComponentID) => string | undefined;
}

export interface RawLoadGroup {
  ids: ComponentID[];
  core: boolean;
  aspects: boolean;
  seeders: boolean;
  envs: boolean;
}

export interface BuildLoadPlanResult {
  /** Groups in load order, with empty groups already filtered out. Caller still needs to split ids by ws/scope. */
  groups: RawLoadGroup[];
  /**
   * Extension component IDs discovered while building the plan that weren't part
   * of the original input. The caller must register them (typically via
   * `groupAndUpdateIds`) before applying the ws/scope split, so the split
   * sees their up-to-date workspace presence.
   */
  extraExtensionIds: ComponentID[];
}

/**
 * Pure function that produces the load groups in canonical order:
 *
 *   1. Core envs (always first — no loading needed).
 *   2. Layered envs of workspace components (deepest first via env-DAG sort).
 *   3. Extra extension components not in the input (one flat group).
 *   4. Layered extensions of components in the input (deepest first via ext-DAG sort).
 *   5. Regular components (non-env, non-ext) — load last.
 *
 * Empty groups are filtered. The caller is responsible for splitting each
 * group's `ids` into workspaceIds/scopeIds, since that classification depends
 * on workspace state that this function shouldn't reach into.
 */
export function buildLoadPlanGroups(input: LoadPlanInput): BuildLoadPlanResult {
  const { workspaceIds, scopeIds, isCoreEnv, extensionsOf, envIdOf } = input;
  const allIds = [...workspaceIds, ...scopeIds];

  // Step 1: separate core envs from everything else.
  const coreEnvs: ComponentID[] = [];
  const nonCoreEnvs: ComponentID[] = [];
  for (const id of allIds) {
    if (isCoreEnv(id)) coreEnvs.push(id);
    else nonCoreEnvs.push(id);
  }

  // Step 2: collect all extension component ids referenced by non-core-envs (deduped).
  const allExtIds = new Map<string, ComponentID>();
  for (const id of nonCoreEnvs) {
    for (const ext of extensionsOf(id)) {
      if (ext.newExtensionId && !allExtIds.has(ext.stringId)) {
        allExtIds.set(ext.stringId, ext.newExtensionId);
      }
    }
  }
  const allExtCompIds = Array.from(allExtIds.values());

  // Step 3: identify envs of workspace components.
  const envsIdsOfWsComps = new Set<string>();
  for (const id of workspaceIds) {
    const envId = envIdOf(id);
    if (envId) envsIdsOfWsComps.add(envId);
  }

  // Step 4: split extension comp ids by whether they're an env-of-ws-comp.
  const extsThatAreEnvsOfWsComps: ComponentID[] = [];
  const extsThatArent: ComponentID[] = [];
  for (const id of allExtCompIds) {
    const idStr = id.toString();
    const withoutVersion = idStr.split('@')[0];
    if (envsIdsOfWsComps.has(idStr) || envsIdsOfWsComps.has(withoutVersion)) {
      extsThatAreEnvsOfWsComps.push(id);
    } else {
      extsThatArent.push(id);
    }
  }
  const notEnvOfWsCompsStrs = new Set(extsThatArent.map((id) => id.toString()));

  // Step 5: from the original non-core-env inputs, identify which are extensions of others in the list.
  const extsFromTheList: ComponentID[] = [];
  const nonExtNonEnvComps: ComponentID[] = [];
  for (const id of nonCoreEnvs) {
    if (notEnvOfWsCompsStrs.has(id.toString())) extsFromTheList.push(id);
    else nonExtNonEnvComps.push(id);
  }

  // Step 6: identify extension ids that aren't already in the input list — caller must add them.
  const extsFromTheListStrs = new Set(extsFromTheList.map((id) => id.toString()));
  const extraExtensionIds: ComponentID[] = [];
  for (const id of allExtIds.values()) {
    if (!extsFromTheListStrs.has(id.toString())) extraExtensionIds.push(id);
  }

  // Step 7: layer envs and extensions topologically (deepest first).
  const layeredEnvs = groupEnvsByDepLayer(extsThatAreEnvsOfWsComps, (id) => envIdOf(id), envsIdsOfWsComps);
  const layeredExts = groupExtsByDepLayer(extsFromTheList, (id) => {
    const out: string[] = [];
    for (const ext of extensionsOf(id)) {
      out.push(ext.stringId);
      if (ext.newExtensionId) out.push(ext.newExtensionId.toStringWithoutVersion());
    }
    return out;
  });

  // Step 8: assemble groups in canonical order.
  const rawGroups: RawLoadGroup[] = [
    { ids: coreEnvs, core: true, aspects: true, seeders: true, envs: true },
    ...layeredEnvs.map((ids) => ({ ids, core: false, aspects: true, seeders: true, envs: true })),
    { ids: extraExtensionIds, core: false, aspects: true, seeders: false, envs: false },
    ...layeredExts.map((ids) => ({ ids, core: false, aspects: true, seeders: true, envs: false })),
    { ids: nonExtNonEnvComps, core: false, aspects: false, seeders: true, envs: false },
  ];

  return {
    groups: rawGroups.filter((g) => g.ids.length > 0),
    extraExtensionIds,
  };
}
