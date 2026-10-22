import path from 'path';
import { globSync } from 'glob';
import type { Scope } from '@teambit/legacy.scope';
import { ServerIsBusy } from '@teambit/legacy.scope';
import { PENDING_OBJECTS_DIR } from '@teambit/legacy.constants';
import { mergeObjects } from '@teambit/export';
import type { Action } from './action';
import { logger } from '@teambit/legacy.logger';
import type { BitObjectList, ModelComponent, Ref } from '@teambit/objects';
import { getAllVersionParents } from '@teambit/component.snap-distance';
import { ComponentIdList } from '@teambit/component-id';
import type { LaneId } from '@teambit/lane-id';
import { pMapPool } from '@teambit/toolbox.promise.map-pool';
import { concurrentComponentsLimit } from '@teambit/harmony.modules.concurrency';

type Options = { clientId: string; isResumingExport: boolean };
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
   * After the fetch, `getAllVersionParents(throws: true)` walks each component's VH from
   * `modelComponent.head` (or from its first ancestors that weren't sent, see `getFirstNotIncomingAncestors`)
   * and throws if any parent is missing.
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
      // home-scope fetch rather than blocking the export. The final `getAllVersionParents`
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
    const incomingParents = new Map(
      bitObjectList.getVersions().map((version) => [version.hash().toString(), version.parents])
    );
    await pMapPool(
      externalComponents,
      async (modelComponent) => {
        const head = modelComponent.getHead();
        if (!head) return;
        const heads = this.getFirstNotIncomingAncestors(head, incomingParents);
        await getAllVersionParents({ modelComponent, repo: this.scope.objects, throws: true, heads });
      },
      { concurrency: concurrentComponentsLimit() }
    );
  }

  /**
   * the main head may be a snap that was never exported to the home scope (e.g. snapped on main, then a lane was
   * created and snapped on top of it). such snaps are sent as part of this export, so they're not in the repo yet.
   * walk past them and return the first ancestors that weren't sent, which must be resolvable from the home scope.
   */
  private getFirstNotIncomingAncestors(head: Ref, incomingParents: Map<string, Ref[]>): Ref[] {
    const results: Ref[] = [];
    const visited = new Set<string>();
    const stack: Ref[] = [head];
    while (stack.length) {
      const ref = stack.pop() as Ref;
      const hash = ref.toString();
      if (visited.has(hash)) continue;
      visited.add(hash);
      const parents = incomingParents.get(hash);
      if (parents) stack.push(...parents);
      else results.push(ref);
    }
    return results;
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
