import path from 'path';
import { globSync } from 'glob';
import type { Scope } from '@teambit/legacy.scope';
import { ServerIsBusy } from '@teambit/legacy.scope';
import { PENDING_OBJECTS_DIR } from '@teambit/legacy.constants';
import { mergeObjects } from '@teambit/export';
import type { Action } from './action';
import { logger } from '@teambit/legacy.logger';
import type { BitObjectList, Lane, ModelComponent, Version } from '@teambit/objects';
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
   * Two-step:
   *  1. Pre-check closure (existing VH + incoming Versions). On subsequent exports the previous
   *     fetch already closed the chain — new snaps just extend it, so this step skips the
   *     network round-trip entirely.
   *  2. For components that still have gaps, fetch missing VH:
   *     - Fork export (lane has `forkedFrom` pointing to a different scope): from the
   *       forkedFrom lane's scope. By the recursive invariant, that scope's VH is already
   *       closed — one fetch covers both main-origin gaps and lane-origin link snaps the home
   *       scope wouldn't have.
   *     - Otherwise: from each external component's home scope.
   *
   * After the fetch, re-verify closure. If anything is still missing, fail the export with a
   * clear error — silent incompleteness later manifests as "no common snap" on merge-lane and
   * truncated `bit log`.
   */
  private async importAndThrowForMissingHistoryOnLane(bitObjectList: BitObjectList) {
    const modelComponents = bitObjectList.getComponents();
    const externalComponents = modelComponents.filter((comp) => comp.scope !== this.scope.name);
    if (!externalComponents.length) return;

    const incomingLane = bitObjectList.getLanes()[0];
    const incomingVersions = bitObjectList.getVersions();

    const incomplete = (
      await pMapPool(
        externalComponents,
        async (modelComponent) => {
          const missing = await this.findMissingFromVH(modelComponent, incomingLane, incomingVersions);
          return missing.length ? modelComponent : null;
        },
        { concurrency: concurrentComponentsLimit() }
      )
    ).filter((c): c is ModelComponent => c !== null);

    if (!incomplete.length) return;

    const forkedFrom = incomingLane?.forkedFrom;
    if (forkedFrom && forkedFrom.scope !== this.scope.name) {
      await this.fetchVersionHistoryFromForkedFromScope(incomplete, forkedFrom);
    } else {
      await this.scope.scopeImporter.importMissingVersionHistory(incomplete);
    }

    await pMapPool(
      incomplete,
      (modelComponent) => this.assertVersionHistoryClosed(modelComponent, incomingLane, incomingVersions),
      { concurrency: concurrentComponentsLimit() }
    );
  }

  /**
   * Returns the dangling parent refs for `modelComponent` once the incoming Versions are
   * notionally merged into the on-disk VH. Empty array = closed graph.
   *
   * Only walks `parents` — not `squashed` / `unrelated`. Those are auxiliary metadata that
   * legitimately point at refs which may not exist anywhere in the system (e.g. after a
   * cross-scope squash-merge into main, the `squashed.previousParents` reference lane snaps
   * that main never received and never will). This matches `getAllHashesFrom`, the canonical
   * VH closure walker, and avoids false-positive "incomplete" errors on legitimate state.
   *
   * We build a separate hash→parents map instead of calling `addFromVersionsObjects` on the
   * loaded VH. The loaded VH may be the cached instance; mutating it could leak the pre-merge
   * state to disk via the fetch's `mergeVersionHistory` path if validation later fails.
   */
  private async findMissingFromVH(
    modelComponent: ModelComponent,
    incomingLane: Lane | undefined,
    incomingVersions: Version[]
  ): Promise<string[]> {
    const versionHistory = await modelComponent.getVersionHistory(this.scope.objects);
    const versionsForThisComp = incomingVersions.filter(
      (v) => v.origin?.id?.name === modelComponent.name && v.origin?.id?.scope === modelComponent.scope
    );
    const parentsByHash = new Map<string, string[]>();
    for (const v of versionHistory.versions) {
      parentsByHash.set(
        v.hash.toString(),
        v.parents.map((p) => p.toString())
      );
    }
    for (const v of versionsForThisComp) {
      parentsByHash.set(
        v.hash().toString(),
        v.parents.map((p) => p.toString())
      );
    }
    const heads = new Set<string>();
    const laneHead = incomingLane?.getCompHeadIncludeUpdateDependents(modelComponent.toComponentId());
    if (laneHead) heads.add(laneHead.toString());
    if (modelComponent.head) heads.add(modelComponent.head.toString());

    const visited = new Set<string>();
    const missing: string[] = [];
    for (const headStr of heads) {
      const stack = [headStr];
      while (stack.length) {
        const hash = stack.pop()!;
        if (visited.has(hash)) continue;
        visited.add(hash);
        const parents = parentsByHash.get(hash);
        if (!parents) {
          missing.push(hash);
          continue;
        }
        for (const p of parents) if (!visited.has(p)) stack.push(p);
      }
    }
    return missing;
  }

  private async assertVersionHistoryClosed(
    modelComponent: ModelComponent,
    incomingLane: Lane | undefined,
    incomingVersions: Version[]
  ) {
    const missing = await this.findMissingFromVH(modelComponent, incomingLane, incomingVersions);
    if (missing.length) {
      throw new Error(
        `export-validate: VersionHistory for ${modelComponent.id()} on scope "${this.scope.name}" is ` +
          `incomplete — ${missing.length} dangling parent ref(s): ` +
          `${missing
            .slice(0, 5)
            .map((m) => m.slice(0, 9))
            .join(', ')}${missing.length > 5 ? ', …' : ''}. ` +
          `Ensure the component's home scope and the forked-from lane scope are reachable.`
      );
    }
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
