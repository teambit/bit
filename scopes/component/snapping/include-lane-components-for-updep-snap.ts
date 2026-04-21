import type { ComponentID } from '@teambit/component-id';
import { ComponentIdList } from '@teambit/component-id';
import type { Component } from '@teambit/component';
import type { ScopeMain } from '@teambit/scope';
import type { Logger } from '@teambit/logger';
import type { Lane } from '@teambit/objects';

export type LaneCompsForUpDepSnap = {
  components: Component[];
  ids: ComponentIdList;
};

/**
 * When `bit _snap --update-dependents` runs in a bare scope, it creates new Version objects for
 * the target components (they land in `lane.updateDependents`). Any entry in `lane.components` that
 * depends on one of those targets now has a stale dep: its recorded version points to the target's
 * pre-updateDependents version (typically the main tag), not the fresh `updateDependents` hash.
 *
 * This helper finds those affected `lane.components` and returns them as extra snap seeders so
 * they can be re-snapped in the same `_snap --update-dependents` pass, with dep refs rewritten to
 * the cascaded hashes by `updateDependenciesVersions`. They stay in `lane.components` (not moved
 * to `updateDependents`) because they were already there — the caller distinguishes via the
 * `updateDependentIds` VersionMakerParam.
 *
 * The dependency set expands via fixed-point iteration so transitive dependents on the lane are
 * picked up too (edit X in updateDependents → Y depends on X → Z depends on Y; all three end up
 * in the same snap pass with pre-assigned hashes, which also handles cycles).
 */
export async function findLaneComponentsDependingOnUpdDepTargets({
  lane,
  targetIds,
  scope,
  logger,
}: {
  lane: Lane;
  targetIds: ComponentIdList;
  scope: ScopeMain;
  logger: Logger;
}): Promise<LaneCompsForUpDepSnap> {
  const empty: LaneCompsForUpDepSnap = { components: [], ids: new ComponentIdList() };
  const laneComponents = lane.components;
  if (!laneComponents.length || !targetIds.length) return empty;

  const legacyScope = scope.legacyScope;

  // Ensure every lane.components Version object is available locally — we need to inspect their
  // recorded deps to decide who to pull in.
  const laneCompIds = ComponentIdList.fromArray(laneComponents.map((c) => c.id.changeVersion(c.head.toString())));
  try {
    await legacyScope.scopeImporter.importWithoutDeps(laneCompIds, {
      cache: true,
      lane,
      reason: 'for finding lane.components that depend on the updateDependents being snapped',
    });
  } catch (err: any) {
    logger.debug(`findLaneComponentsDependingOnUpdDepTargets: failed to pre-fetch lane.components: ${err.message}`);
  }

  type LoadedEntry = { id: ComponentID; depIds: ComponentID[] };
  const loaded: LoadedEntry[] = [];
  for (const laneComp of laneComponents) {
    const modelComponent = await legacyScope.getModelComponentIfExist(laneComp.id);
    if (!modelComponent) continue;
    const version = await modelComponent.loadVersion(laneComp.head.toString(), legacyScope.objects, false);
    if (!version) {
      logger.debug(
        `findLaneComponentsDependingOnUpdDepTargets: Version object for ${laneComp.id.toString()}@${laneComp.head.toString()} is missing, skipping`
      );
      continue;
    }
    const depIds = [...version.dependencies.get().map((d) => d.id), ...version.devDependencies.get().map((d) => d.id)];
    loaded.push({ id: laneComp.id.changeVersion(laneComp.head.toString()), depIds });
  }

  if (!loaded.length) return empty;

  const includeSet = new Set<string>(targetIds.map((id) => id.toStringWithoutVersion()));
  let changed = true;
  while (changed) {
    changed = false;
    for (const entry of loaded) {
      const key = entry.id.toStringWithoutVersion();
      if (includeSet.has(key)) continue;
      const matches = entry.depIds.some((depId) => includeSet.has(depId.toStringWithoutVersion()));
      if (matches) {
        includeSet.add(key);
        changed = true;
      }
    }
  }

  const toInclude = loaded.filter((entry) => {
    const key = entry.id.toStringWithoutVersion();
    if (!includeSet.has(key)) return false;
    // the targets themselves are already in the seed set handled by the caller; don't double-add.
    if (targetIds.searchWithoutVersion(entry.id)) return false;
    return true;
  });
  if (!toInclude.length) return empty;

  const components = await Promise.all(
    toInclude.map(async (entry) => {
      const comp = await scope.get(entry.id);
      if (!comp) {
        throw new Error(`findLaneComponentsDependingOnUpdDepTargets: unable to load ${entry.id.toString()} from scope`);
      }
      return comp;
    })
  );
  const ids = ComponentIdList.fromArray(components.map((c) => c.id));
  return { components, ids };
}
