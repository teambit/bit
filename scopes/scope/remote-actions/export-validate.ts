import path from 'path';
import { globSync } from 'glob';
import type { Scope } from '@teambit/legacy.scope';
import { ServerIsBusy } from '@teambit/legacy.scope';
import { PENDING_OBJECTS_DIR } from '@teambit/legacy.constants';
import { mergeObjects } from '@teambit/export';
import type { Action } from './action';
import { logger } from '@teambit/legacy.logger';
import { BitError } from '@teambit/bit-error';
import type { BitObjectList, Lane, ModelComponent, Version } from '@teambit/objects';
import { Ref } from '@teambit/objects';
import { getAllVersionHashes, indexVersionObjects } from '@teambit/component.snap-distance';
import { ComponentIdList } from '@teambit/component-id';
import type { LaneId } from '@teambit/lane-id';
import { compact, uniq } from 'lodash';
import { pMapPool } from '@teambit/toolbox.promise.map-pool';
import { concurrentComponentsLimit } from '@teambit/harmony.modules.concurrency';

type Options = { clientId: string; isResumingExport: boolean };
type MissingPerComp = { modelComponent: ModelComponent; missing: Ref[] };
const NUM_OF_RETRIES = 60;
const WAIT_BEFORE_RETRY_IN_MS = 1000;

/**
 * do not save the exported objects. just make sure the objects can be merged and there are no conflicts.
 * once done, clear the objects from the memory so then they won't be used by mistake later on.
 * this also makes sure that non-external dependencies are not missing.
 *
 * Lean-lane-scope: lane exports no longer pre-pull full Version chains for external components
 * (components whose home scope differs from the lane scope) — that was the OOM driver when a
 * lane was far behind main. We still pull the VersionHistory object (small) so the lane scope
 * always has a closed graph; the actual Version content lives on origin scopes and consumers
 * resolve it on demand. See `importAndThrowForMissingHistoryOnLane` below.
 */
export class ExportValidate implements Action<Options> {
  scope: Scope;
  clientId: string;
  async execute(scope: Scope, options: Options) {
    this.scope = scope;
    this.clientId = options.clientId;
    if (options.isResumingExport && !this.clientIdExistsInPendingDir()) {
      // when resuming export, some scopes may have the objects persisted already and as such, the
      // pending-dir was deleted.
      return;
    }
    const objectList = await scope.readObjectsFromPendingDir(options.clientId);
    const bitObjectList = await objectList.toBitObjects();
    await this.importAndThrowForMissingHistoryOnLane(bitObjectList);
    await this.importMissingSnapsOfForkedLane(bitObjectList);
    await this.waitIfNeeded();
    try {
      logger.profile('export-validate.mergeObjects');
      await mergeObjects(scope, bitObjectList, true); // if fails, it throws merge-conflict/component-not-found
      logger.profile('export-validate.mergeObjects');
    } catch (err) {
      logger.warn(`export-validate, mergeObjects failed, clearing objects before throwing the error`);
      scope.objects.clearObjectsFromCache(); // we don't want to persist anything by mistake.
      throw err;
    }
    scope.objects.clearObjectsFromCache();
  }

  /**
   * For lane exports with external components, ensure the destination scope holds a complete
   * VersionHistory graph for each one. The fetch is VH-only (no `collectParents`), so it
   * doesn't pull the full Version chain — that's what makes this safe with lean lane scopes.
   *
   * Two fetch paths:
   *  - Fork export (lane has `forkedFrom` pointing to a different scope): from the forkedFrom
   *    lane's scope. That scope's VH includes the lane-origin link snaps the home scope
   *    wouldn't have. If the forked-from scope is unreachable or the lane has been deleted
   *    there, we degrade to the home-scope fetch rather than blocking the export.
   *  - Otherwise: from each external component's home scope.
   *
   * After the fetch, `getAllVersionHashes(throws: true)` walks each component's VH from
   * `modelComponent.head` and throws if any parent is missing.
   */
  private async importAndThrowForMissingHistoryOnLane(bitObjectList: BitObjectList) {
    const modelComponents = bitObjectList.getComponents();
    const externalComponents = modelComponents.filter((comp) => comp.scope !== this.scope.name);
    if (!externalComponents.length) return;

    const incomingLane = bitObjectList.getLanes()[0];
    const forkedFrom = incomingLane?.forkedFrom;
    const forkedFromIsRemote = Boolean(forkedFrom && forkedFrom.scope !== this.scope.name);
    let forkedFromFetched = false;
    if (forkedFromIsRemote) {
      // Best-effort: if the upstream lane was deleted/renamed/unreachable, fall back to the
      // home-scope fetch rather than blocking the export. The final `getAllVersionHashes`
      // check will throw with the missing-object error if the fallback didn't close the gap.
      try {
        await this.fetchVersionHistoryFromForkedFromScope(externalComponents, forkedFrom as LaneId);
        forkedFromFetched = true;
      } catch (err: any) {
        logger.warn(
          `export-validate: forked-from VH fetch from "${forkedFrom?.toString()}" failed (${err.message}). ` +
            `Falling back to home-scope fetch.`
        );
      }
    }
    if (!forkedFromFetched) {
      await this.scope.scopeImporter.importMissingVersionHistory(externalComponents);
    }
    await pMapPool(
      externalComponents,
      (modelComponent) => getAllVersionHashes({ modelComponent, repo: this.scope.objects, throws: true }),
      { concurrency: concurrentComponentsLimit() }
    );
  }

  /**
   * a lane forked from a lane of another scope needs the snaps made on the original lane (see
   * `ModelComponent.getLaneOriginAncestors`). this scope has no other copy of them, so without them, the history of the
   * forked lane breaks once the original lane is deleted. clients older than 2.3.23 don't send them, and newer clients
   * fetch them best effort. the VersionHistory check above doesn't catch it, because the VersionHistory fetched from the
   * forked-from lane lists these snaps.
   * the missing snaps are fetched from the scope of the original lane. on the first export of the lane, when some are
   * still missing, the export fails. on a later export, it only repairs a lane that was exported without them, and it
   * never fails.
   */
  private async importMissingSnapsOfForkedLane(bitObjectList: BitObjectList) {
    const lane = bitObjectList.getLanes()[0];
    if (!lane?.forkedFrom || lane.forkedFrom.scope === this.scope.name) return;
    const forkedFrom = lane.forkedFrom;
    const isFirstExport = !(await this.scope.loadLane(lane.toLaneId()));
    const versionObjects = indexVersionObjects(bitObjectList.getVersions());
    const findMissing = () => this.findMissingLaneOriginSnaps(lane, bitObjectList.getComponents(), versionObjects);
    const suspected = await this.importMissingSnapsFromScope(forkedFrom.scope, findMissing);
    if (!suspected.length || !isFirstExport) return;
    // the main head known here might be behind, which makes a newer main snap look like a lane snap. re-check against
    // the main head of the home scope before failing the export.
    const ids = ComponentIdList.fromArray(suspected.map(({ modelComponent }) => modelComponent.toComponentId()));
    try {
      await this.scope.scopeImporter.importWithoutDeps(ids.toVersionLatest(), {
        cache: false,
        includeVersionHistory: true,
        reason: 'to check whether snaps missing from a new forked lane are main snaps',
      });
    } catch (err: any) {
      // without the main heads of the home scopes, a missing snap can't be told apart from a newer main snap. don't
      // block the export based on a main head that might be behind.
      logger.warn(
        `export-validate: failed fetching the main heads from the home scopes, skipping the check of the snaps of the original lane. error: ${err.message}`
      );
      return;
    }
    const stillMissing = await this.keepMissingNotOnMain(
      suspected,
      async (modelComponent) => (await this.scope.getModelComponentIfExist(modelComponent.toComponentId()))?.head
    );
    if (!stillMissing.length) return;
    const errors = stillMissing.map(({ modelComponent, missing }) => `${modelComponent.id()}: ${missing.join(', ')}`);
    throw new BitError(`unable to export the lane "${lane.toLaneId().toString()}" to "${this.scope.name}". the lane is forked from "${forkedFrom.toString()}". the following snaps of the original lane were not exported with it, and they could not be fetched from "${forkedFrom.toString()}":
${errors.join('\n')}
to get these snaps locally, run "bit fetch --lanes ${forkedFrom.toString()} --all-history". then, export again with bit 2.3.23 or newer, which exports them.`);
  }

  /**
   * fetch the missing snaps from the scope of the original lane, as objects, with the objects they reference (files,
   * dependencies data). a component import is not used, because it merges the component object of the original lane
   * into this scope, which is wrong for a component whose home is this scope.
   * each round fetches the snaps that `findMissing` reports, which makes their parents known for the next round. it
   * stops when nothing is missing, or nothing new can be fetched. returns what is still missing.
   */
  private async importMissingSnapsFromScope(
    remoteScope: string,
    findMissing: () => Promise<MissingPerComp[]>
  ): Promise<MissingPerComp[]> {
    const triedHashes = new Set<string>();
    const importObjects = async (hashes: string[]) => {
      try {
        await this.scope.scopeImporter.importManyObjects({ [remoteScope]: hashes });
      } catch (err: any) {
        // the objects that were found are saved. keep going with them.
        logger.warn(
          `export-validate: failed fetching snaps of a forked lane from "${remoteScope}". error: ${err.message}`
        );
      }
    };
    let missingPerComp = await findMissing();
    while (missingPerComp.length) {
      const hashes = uniq(missingPerComp.flatMap(({ missing }) => missing.map((ref) => ref.toString()))).filter(
        (hash) => !triedHashes.has(hash)
      );
      if (!hashes.length) break;
      hashes.forEach((hash) => triedHashes.add(hash));
      await importObjects(hashes);
      const versions = await Promise.all(
        hashes.map((hash) => Ref.from(hash).load(this.scope.objects) as Promise<Version | undefined>)
      );
      const subRefs = compact(versions).flatMap((version) => version.refsWithOptions(false, false));
      if (subRefs.length) await importObjects(subRefs.map((ref) => ref.toString()));
      missingPerComp = await findMissing();
    }
    return missingPerComp;
  }

  /**
   * per component of the lane, the snaps of the original lane that are missing in this scope and in the incoming
   * objects. the snaps in the history of the main head known here are not included (they live on the home scope).
   */
  private async findMissingLaneOriginSnaps(
    lane: Lane,
    modelComponents: ModelComponent[],
    versionObjects: Map<string, Version>
  ): Promise<MissingPerComp[]> {
    const missingPerComp = await pMapPool(
      modelComponents,
      async (modelComponent) => {
        const laneHead = lane.getCompHeadIncludeUpdateDependents(modelComponent.toComponentId());
        if (!laneHead) return { modelComponent, missing: [] };
        const { missing } = await modelComponent.getLaneOriginAncestors(this.scope.objects, laneHead, versionObjects);
        return { modelComponent, missing };
      },
      { concurrency: concurrentComponentsLimit() }
    );
    return this.keepMissingNotOnMain(missingPerComp, async (modelComponent) => modelComponent.head);
  }

  /**
   * drop the missing snaps that are in the history of the main head (they live on the component's home scope), and
   * the components left with no missing snaps.
   */
  private async keepMissingNotOnMain(
    missingPerComp: MissingPerComp[],
    getMainHead: (modelComponent: ModelComponent) => Promise<Ref | undefined>
  ): Promise<MissingPerComp[]> {
    const results = await pMapPool(
      missingPerComp,
      async ({ modelComponent, missing }) => ({
        modelComponent,
        missing: await this.filterOutMainSnaps(modelComponent, missing, await getMainHead(modelComponent)),
      }),
      { concurrency: concurrentComponentsLimit() }
    );
    return results.filter(({ missing }) => missing.length);
  }

  private async filterOutMainSnaps(modelComponent: ModelComponent, refs: Ref[], mainHead?: Ref): Promise<Ref[]> {
    if (!refs.length || !mainHead) return refs;
    const mainHashes = await getAllVersionHashes({
      modelComponent,
      repo: this.scope.objects,
      startFrom: mainHead,
      throws: false,
    });
    const mainHashesSet = new Set(mainHashes.map((ref) => ref.toString()));
    return refs.filter((ref) => !mainHashesSet.has(ref.toString()));
  }

  private async fetchVersionHistoryFromForkedFromScope(externalComponents: ModelComponent[], forkedFromLaneId: LaneId) {
    const lanes = await this.scope.scopeImporter.importLanes([forkedFromLaneId]);
    const forkedFromLane = lanes[0];
    if (!forkedFromLane) {
      throw new Error(
        `export-validate: unable to fetch the forked-from lane "${forkedFromLaneId.toString()}" from its scope`
      );
    }
    const externalIds = ComponentIdList.fromArray(externalComponents.map((c) => c.toComponentId())).toVersionLatest();
    await this.scope.scopeImporter.importWithoutDeps(externalIds, {
      cache: false,
      includeVersionHistory: true,
      lane: forkedFromLane,
      reason: `fetching version-history from forked-from lane ${forkedFromLaneId.toString()}`,
    });
  }

  private async waitIfNeeded() {
    let clientQueue = this.getClientsQueue();
    if (clientQueue[0] === this.clientId) return; // it's your turn
    logger.debug(`export-validate, waitIfNeeded - ${clientQueue.length} clients in queue (including current)`);
    for (let i = 0; i < NUM_OF_RETRIES; i += 1) {
      logger.debug(`export-validate, waitIfNeeded - ${i} out of ${NUM_OF_RETRIES}`);
      // eslint-disable-next-line no-await-in-loop
      await this.sleep(WAIT_BEFORE_RETRY_IN_MS);
      clientQueue = this.getClientsQueue();
      if (clientQueue[0] === this.clientId) {
        break;
      }
    }
    if (clientQueue[0] === this.clientId) return; // it's your turn
    throw new ServerIsBusy(clientQueue.length, clientQueue[0]);
  }

  private getPendingDir() {
    return path.join(this.scope.path, PENDING_OBJECTS_DIR);
  }

  private async sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private clientIdExistsInPendingDir(): boolean {
    const clientsIds = this.getClientIdsDirs();
    return clientsIds.includes(this.clientId);
  }

  private getClientsQueue(): string[] {
    const clientsIds = this.getClientIdsDirs();
    if (!clientsIds.length) {
      throw new Error(`pending-dir of "${this.scope.name}" doesn't have any data`);
    }
    if (!clientsIds.includes(this.clientId)) {
      throw new Error(`pending-dir of "${this.scope.name}" doesn't have the client ${this.clientId} data`);
    }
    return clientsIds.sort();
  }

  private getClientIdsDirs() {
    const cwd = this.getPendingDir();
    return globSync('*', { cwd });
  }
}
