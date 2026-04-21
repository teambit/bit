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
 * *** Why we base the cascade on main head (and ignore the current updateDependents snap) ***
 * The prior updateDependents entry points to an older snap (the one the "snap updates" button
 * produced last time). Parenting the new cascade off that old snap would drift the lane off main:
 * say A was 0.0.1 when first seeded into updateDependents, but main has since moved to 0.0.2 —
 * using the old snap as the parent means the new cascade's history never includes A@0.0.2, and
 * divergence calculations get messy. Instead, we always start from A's current main head. The new
 * updateDependents snap is a direct descendant of main, one commit ahead, with deps rewritten to
 * the lane versions. Any previously cascaded snap on the lane is simply orphaned — that's fine;
 * the lane only ever points at the latest.
 *
 * *** Why the cascade set is a fixed-point expansion ***
 * Starting from the ids the user is snapping, we add any updateDependent whose recorded
 * dependencies (at main head) reference an id already in the set, then repeat. This handles
 * transitive cascades (A -> B -> C, edit C → A and B cascade) and cycles (A -> B -> C -> A)
 * because hashes are pre-assigned by `setHashes()` before deps are rewritten.
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

  // Fetch each updateDependent from main (no lane context) so the loaded ConsumerComponent
  // carries main's head as its version. This flows through `setNewVersion` into
  // `previouslyUsedVersion` and ultimately becomes the parent of the new cascaded snap — keeping
  // it a direct descendant of main rather than of an earlier (now-orphaned) updateDependents snap.
  const mainIds = ComponentIdList.fromArray(updateDependents.map((id) => id.changeVersion(undefined)));
  try {
    await scope.import(mainIds, {
      preferDependencyGraph: false,
      reason: 'for cascading updateDependents in the local snap (using main head as the base)',
    });
  } catch (err: any) {
    logger.debug(`includeUpdateDependentsInSnap: failed to pre-fetch main head for updateDependents: ${err.message}`);
  }

  type LoadedEntry = { id: ComponentID; depIds: ComponentID[]; component: Component };
  const loaded: LoadedEntry[] = [];
  for (const updDepId of updateDependents) {
    const idWithoutVersion = updDepId.changeVersion(undefined);
    const modelComponent = await legacyScope.getModelComponentIfExist(idWithoutVersion);
    if (!modelComponent || !modelComponent.head) {
      logger.debug(`includeUpdateDependentsInSnap: ${updDepId.toString()} has no main head locally, skipping`);
      continue;
    }
    const mainHeadStr = modelComponent.getTagOfRefIfExists(modelComponent.head) || modelComponent.head.toString();
    const idAtMainHead = idWithoutVersion.changeVersion(mainHeadStr);
    const component = await scope.get(idAtMainHead);
    if (!component) {
      logger.debug(`includeUpdateDependentsInSnap: unable to load ${idAtMainHead.toString()} from scope, skipping`);
      continue;
    }
    const consumerComp = component.state._consumer;
    const depIds = [
      ...consumerComp.dependencies.get().map((d) => d.id),
      ...consumerComp.devDependencies.get().map((d) => d.id),
    ];
    loaded.push({ id: component.id, depIds, component });
  }

  if (!loaded.length) return empty;

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

  const components = toInclude.map((entry) => entry.component);
  const ids = ComponentIdList.fromArray(components.map((c) => c.id));
  return { components, ids };
}
