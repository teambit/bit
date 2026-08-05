import chalk from 'chalk';
import type { ComponentID } from '@teambit/component-id';
import { ComponentIdList } from '@teambit/component-id';
import type { ImporterMain } from '@teambit/importer';
import type { LanesMain } from '@teambit/lanes';
import type { Logger } from '@teambit/logger';
import type { Workspace } from '@teambit/workspace';

/**
 * A new (versionless) `.bitmap` entry whose id the target lane also carries breaks the lane
 * switch twice over: the entry has no scope, so the legacy layer reads the component as "local,
 * never exported" — the lane fetch's default filter then drops the id and the lane merge dies
 * with `unable to merge lane …, the component … was not found`, and every import on the way
 * refuses to fetch a "local" id from the remote. The onboarding quickstart manufactures exactly
 * this state: `bit add` a component, commit `.bitmap`, and let the component's first export
 * happen on a lane.
 *
 * Adopt the lane's version INTO each shadowing entry (in memory only — a failed switch must not
 * rewrite `.bitmap` on disk): the entry keeps its rootDir and config, stops reading as local, and
 * the objects import below succeeds through `importMany`'s existing `includeUnexported` escape
 * hatch (the ids come from the lane object, so they exist on the remote by construction).
 * Matching is scope+name, so a same-named new component from another scope stays untouched.
 *
 * Returns the adopted ids at the lane's version. The switch skips them as already up to date, so
 * an importing caller must materialize their files afterwards (`checkout --reset`).
 */
export async function adoptNewComponentsTheLaneProvides(
  deps: { workspace: Workspace; lanes: LanesMain; importer: ImporterMain; logger: Logger },
  laneName: string
): Promise<ComponentID[]> {
  const { workspace, lanes, importer, logger } = deps;
  const noneAdopted: ComponentID[] = [];
  const newIds = await workspace.newComponentIds();
  if (!newIds.length) return noneAdopted;
  const laneId = await lanes.parseLaneId(laneName);
  if (laneId.isDefault()) return noneAdopted;
  const laneData = (await lanes.getLanes({ remote: laneId.scope, name: laneId.name }).catch(() => []))[0];
  const laneComps = [...(laneData?.components ?? []), ...(laneData?.updateDependents ?? [])];
  const shadowed = laneComps.filter((laneComp) => newIds.some((newId) => laneComp.id.isEqualWithoutVersion(newId)));
  if (!shadowed.length) return noneAdopted;
  logger.console(
    chalk.blue(
      `Lane ${laneId.toString()} provides ${shadowed.length} component(s) this workspace tracks as new — ` +
        `adopting the lane's version: ${shadowed.map((c) => c.id.toStringWithoutVersion()).join(', ')}`
    )
  );
  const bitMap = workspace.consumer.bitMap;
  shadowed.forEach((laneComp) => {
    const componentMap = bitMap.getComponentIfExist(laneComp.id, { ignoreVersion: true });
    if (!componentMap) return;
    bitMap.updateComponentId(laneComp.id.changeVersion(laneComp.head));
    componentMap.onLanesOnly = true;
  });
  // the workspace caches component lists computed from the pre-adoption `.bitmap`
  await workspace.clearCache();
  const lane = await importer.importLaneObject(laneId);
  const adoptedIds = shadowed.map((c) => c.id.changeVersion(c.head));
  await workspace.scope.legacyScope.scopeImporter.importMany({
    ids: ComponentIdList.fromArray(adoptedIds),
    lane,
    includeUnexported: true,
    reason: `${laneId.toString()} provides component(s) this workspace tracks as new`,
  });
  return adoptedIds;
}
