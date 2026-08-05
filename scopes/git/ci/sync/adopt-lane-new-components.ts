import chalk from 'chalk';
import type { ComponentID } from '@teambit/component-id';
import { ComponentIdList } from '@teambit/component-id';
import type { ImporterMain } from '@teambit/importer';
import type { LanesMain } from '@teambit/lanes';
import type { Logger } from '@teambit/logger';
import type { Workspace } from '@teambit/workspace';

/**
 * A lane switch halts when the target lane carries a component that the workspace tracks as a
 * new component. A versionless `.bitmap` entry has no scope, so the legacy layer reads the
 * component as local and not exported. The default filter of `importMany` then drops the id from
 * the lane fetch, and the lane merge halts with `unable to merge lane …, the component … was not
 * found`. Each later import also refuses to fetch a "local" id from the remote. The onboarding
 * quickstart creates this state: the user runs `bit add`, commits `.bitmap`, and exports the
 * component for the first time on a lane.
 *
 * This function adopts the lane's version into each shadowing entry, in memory only. The entry
 * keeps its rootDir and its config, and the legacy layer no longer reads it as local. A failed
 * switch does not change `.bitmap` on disk. The function then imports the objects of the adopted
 * components with the existing `includeUnexported` option of `importMany`. The ids come from the
 * lane object, so they exist on the remote.
 *
 * The match compares scope and name. A new component with the same name from a different scope
 * does not change.
 *
 * The function returns the adopted ids at the lane's version. The switch skips an entry that
 * already records the target version, so an importing caller must write the files afterwards
 * (`checkout --reset`).
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
