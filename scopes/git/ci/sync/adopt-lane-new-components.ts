import chalk from 'chalk';
import type { ComponentID } from '@teambit/component-id';
import { ComponentIdList } from '@teambit/component-id';
import type { LanesMain } from '@teambit/lanes';
import type { Logger } from '@teambit/logger';
import type { Workspace } from '@teambit/workspace';
import { capEntries } from './lane-sync-executor';

export type AdoptLaneNewComponentsDeps = {
  workspace: Workspace;
  lanes: LanesMain;
  logger: Logger;
};

/**
 * The lane merge (`sources.mergeLane` in the legacy scope) throws a plain Error with this wording
 * when a lane component's objects are absent. A typed error needs a change outside the ci aspect;
 * the stale-lane recovery of `bit ci pr` matches the same text.
 */
export function isLaneMissingComponentError(err: unknown): boolean {
  const msg = (err as Error)?.message ?? String(err ?? '');
  return msg.includes('unable to merge lane') && msg.includes('was not found');
}

/**
 * A versionless `.bitmap` entry reads as local and unexported, so a lane fetch drops its id and
 * the lane merge fails with `the component … was not found`. Adopt the lane's version into each
 * such entry, and import the adopted objects (`includeUnexported`, because the entries made them
 * look local). The mutation is in memory; the caller owns the rollback on a failed retry.
 * The returned ids already record the lane's version, so a retried switch skips their files; an
 * importing caller must write them (`checkout --reset`).
 */
export async function adoptNewComponentsTheLaneProvides(
  laneName: string,
  { workspace, lanes, logger }: AdoptLaneNewComponentsDeps
): Promise<ComponentID[]> {
  const newIds = await workspace.newComponentIds();
  if (!newIds.length) return [];
  const laneId = await lanes.parseLaneId(laneName);
  if (laneId.isDefault()) return [];
  const lane = await lanes.importLaneObject(laneId);
  const newIdsList = ComponentIdList.fromArray(newIds);
  const adoptedIds = lane
    .toComponentIdsIncludeUpdateDependents()
    .filter((laneCompId) => newIdsList.hasWithoutVersion(laneCompId));
  if (!adoptedIds.length) return [];
  logger.console(
    chalk.blue(
      `Adopting the lane's version for component(s) this workspace tracks as new: ` +
        capEntries(adoptedIds.map((id) => id.toStringWithoutVersion())).join(', ')
    )
  );
  const bitMap = workspace.consumer.bitMap;
  adoptedIds.forEach((id) => {
    bitMap.updateComponentId(id);
    bitMap.setOnLanesOnly(id, true);
  });
  // cached component lists still reflect the pre-adoption `.bitmap`
  workspace.clearAllComponentsCache();
  await workspace.scope.legacyScope.scopeImporter.importMany({
    ids: ComponentIdList.fromArray(adoptedIds),
    lane,
    includeUnexported: true,
    includeUpdateDependents: true,
    reason: `lane ${laneId.toString()} provides component(s) this workspace tracks as new`,
  });
  return adoptedIds;
}
