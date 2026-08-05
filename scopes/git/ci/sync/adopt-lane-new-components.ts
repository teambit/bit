import chalk from 'chalk';
import type { CheckoutMain } from '@teambit/checkout';
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

export type AdoptRetryDeps = AdoptLaneNewComponentsDeps & {
  checkout: CheckoutMain;
  reloadWorkspace: () => Promise<void>;
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

/**
 * Runs after a switch failed with the missing-component marker: adopt the lane's versions, then
 * retry the switch once. Returns undefined on success, and the error to report on failure. A
 * failed retry reloads the workspace from disk — the failed switch never wrote to it — so the
 * in-memory adoption disappears completely (including `updatedIds` and the changed flag).
 */
export async function adoptAndRetrySwitch(
  laneName: string,
  originalErr: Error,
  doSwitch: () => Promise<unknown>,
  writeAdoptedFiles: boolean | undefined,
  deps: AdoptRetryDeps
): Promise<Error | undefined> {
  const { logger, reloadWorkspace } = deps;
  const rollback = async (err: Error) => {
    await reloadWorkspace().catch((reloadErr) => {
      logger.console(
        chalk.yellow(`Failed to reload the workspace after the adoption retry: ${reloadErr?.toString() ?? reloadErr}`)
      );
    });
    return err;
  };
  const adopted = await adoptNewComponentsTheLaneProvides(laneName, deps).catch((adoptErr) => {
    logger.console(chalk.yellow(`The adoption retry failed: ${adoptErr?.toString() ?? adoptErr}`));
    return [];
  });
  if (!adopted.length) return rollback(originalErr);
  try {
    await doSwitch();
    // the retried switch skips an id already at the lane's version, so its files are still unwritten
    if (writeAdoptedFiles) await writeFilesKeepingConfig(adopted, deps);
    return undefined;
  } catch (retryErr: any) {
    return rollback(retryErr);
  }
}

/**
 * `checkout --reset` writes the files of an entry that already records the target version, but its
 * `resetConfig` also deletes the entry's `.bitmap` config — keep the config across the call.
 */
async function writeFilesKeepingConfig(adopted: ComponentID[], { workspace, checkout }: AdoptRetryDeps) {
  const bitMap = workspace.consumer.bitMap;
  const entryConfig = (id: ComponentID) => bitMap.getComponentIfExist(id, { ignoreVersion: true })?.config;
  const configs = adopted.map((id) => ({ id, config: entryConfig(id) }));
  await checkout.checkout({ ids: adopted, reset: true, skipNpmInstall: true });
  configs.forEach(({ id, config }) => {
    const entry = bitMap.getComponentIfExist(id, { ignoreVersion: true });
    if (!config || !entry || entry.config) return;
    entry.config = config;
    bitMap.markAsChanged();
  });
}
