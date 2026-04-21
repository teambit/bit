import type { ComponentID } from '@teambit/component-id';
import { ComponentIdList } from '@teambit/component-id';
import type { Component } from '@teambit/component';
import type { ScopeMain } from '@teambit/scope';
import type { Logger } from '@teambit/logger';
import type { Lane } from '@teambit/objects';

export type UpdateDependentsForSnap = {
  components: Component[];
  ids: ComponentIdList;
};

/**
 * When snapping on a lane that has `updateDependents`, fold the relevant entries into the same
 * snap pass so they land with correct dependency hashes on the first try. Returns the components
 * to include as extra snap seeders along with their ids; the caller appends them to the main
 * snap's seeds before handing things off to the VersionMaker.
 *
 * Without this, `updateDependents` go stale as soon as any lane component they depend on is
 * re-snapped locally, because the old entries keep pointing at Version objects whose recorded
 * dependencies reference outdated lane-component hashes. Re-snapping them in the same pass (rather
 * than in a separate post-step) avoids producing two Version objects per cascade and keeps the
 * number of downstream Ripple CI builds at one per component, just like a normal snap.
 *
 * The `cascade set` is computed by a fixed-point expansion: start with the ids the user is
 * snapping, then repeatedly add any updateDependent whose recorded dependencies reference an id
 * already in the set. This handles transitive cascades (A -> B -> C, edit C → A and B cascade) and
 * cycles (A -> B -> C -> A) because hashes are pre-assigned by `setHashes()` before deps are
 * rewritten.
 */
export async function includeUpdateDependentsInSnap({
  lane,
  snapIds,
  scope,
  logger,
}: {
  lane?: Lane;
  snapIds: ComponentIdList;
  scope: ScopeMain;
  logger: Logger;
}): Promise<UpdateDependentsForSnap> {
  const empty: UpdateDependentsForSnap = { components: [], ids: new ComponentIdList() };
  if (!lane) return empty;
  const updateDependents = lane.updateDependents;
  if (!updateDependents || !updateDependents.length) return empty;

  const legacyScope = scope.legacyScope;
  const updateDependentsIdList = ComponentIdList.fromArray(updateDependents);

  try {
    await legacyScope.scopeImporter.importWithoutDeps(updateDependentsIdList, {
      cache: true,
      includeUpdateDependents: true,
      // VersionHistory is needed so that `getDivergeData` can resolve the remote head during
      // export. Without it, `bit snap` succeeds locally but `bit export` fails with
      // "TargetHeadNotFound" because the old updateDependents hash isn't reachable through
      // VersionHistory in workspaces that never imported the updateDependent's objects.
      includeVersionHistory: true,
      lane,
      reason: 'for including updateDependents in the local snap',
    });
  } catch (err: any) {
    logger.debug(`includeUpdateDependentsInSnap: failed to pre-fetch updateDependents Version objects: ${err.message}`);
  }

  const loaded: Array<{ id: ComponentID; depIds: ComponentID[]; component?: Component }> = [];
  for (const updDepId of updateDependents) {
    const oldHash = updDepId.version;
    if (!oldHash) continue;
    const modelComponent = await legacyScope.getModelComponent(updDepId);
    const version = await modelComponent.loadVersion(oldHash, legacyScope.objects, false);
    if (!version) {
      logger.debug(
        `includeUpdateDependentsInSnap: Version object for ${updDepId.toString()} is missing locally, skipping`
      );
      continue;
    }
    const depIds = [...version.dependencies.get().map((d) => d.id), ...version.devDependencies.get().map((d) => d.id)];
    loaded.push({ id: updDepId, depIds });
  }

  if (!loaded.length) return empty;

  // Fixed-point expansion: add every updateDependent whose deps point at an id already in the
  // cascade set. Repeat until nothing new is added. This handles transitive and cyclic cases.
  const cascadeSet = new Set<string>(snapIds.map((id) => id.toStringWithoutVersion()));
  let changed = true;
  while (changed) {
    changed = false;
    for (const entry of loaded) {
      const key = entry.id.toStringWithoutVersion();
      if (cascadeSet.has(key)) continue;
      const matches = entry.depIds.some((depId) => cascadeSet.has(depId.toStringWithoutVersion()));
      if (matches) {
        cascadeSet.add(key);
        changed = true;
      }
    }
  }

  const toInclude = loaded.filter((entry) => {
    const key = entry.id.toStringWithoutVersion();
    if (!cascadeSet.has(key)) return false;
    // don't include anything the user is already snapping directly.
    if (snapIds.searchWithoutVersion(entry.id)) return false;
    return true;
  });
  if (!toInclude.length) return empty;

  const components = await Promise.all(
    toInclude.map(async (entry) => {
      const comp = await scope.get(entry.id);
      if (!comp) {
        throw new Error(`includeUpdateDependentsInSnap: unable to load component ${entry.id.toString()} from scope`);
      }
      return comp;
    })
  );

  const ids = ComponentIdList.fromArray(components.map((c) => c.id));
  return { components, ids };
}
