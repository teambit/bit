import path from 'path';
import glob from 'glob';
import { Scope } from '..';
import { PENDING_OBJECTS_DIR } from '../../constants';
import { mergeObjects } from '../component-ops/export-scope-components';
import { Action } from './action';
import logger from '../../logger/logger';
import ServerIsBusy from '../exceptions/server-is-busy';
import { BitObjectList } from '../objects/bit-object-list';
import { getAllVersionHashes } from '../component-ops/traverse-versions';

type Options = { clientId: string; isResumingExport: boolean };
const NUM_OF_RETRIES = 60;
const WAIT_BEFORE_RETRY_IN_MS = 1000;

/**
 * do not save the exported objects. just make sure the objects can be merged and there are no conflicts.
 * once done, clear the objects from the memory so then they won't be used by mistake later on.
 * this also makes sure that non-external dependencies are not missing.
 * also, in case the lane is exported and there are non-local components coming from the lane, it imports them from
 * their original scopes and throw if they're missing from there.
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
      await mergeObjects(scope, bitObjectList, true); // if fails, it throws merge-conflict/component-not-found
    } catch (err) {
      scope.objects.clearCache(); // we don't want to persist anything by mistake.
      throw err;
    }
    scope.objects.clearCache();
  }

  private async importAndThrowForMissingHistoryOnLane(bitObjectList: BitObjectList) {
    const modelComponents = bitObjectList.getComponents();
    const externalComponents = modelComponents.filter((comp) => comp.scope !== this.scope.name);
    if (!externalComponents.length) return;
    await this.scope.scopeImporter.importMissingVersionHistory(externalComponents);
    // this will throw in case the history is missing
    await Promise.all(
      externalComponents.map((modelComponent) =>
        getAllVersionHashes({ modelComponent, repo: this.scope.objects, throws: true })
      )
    );
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
    return glob.sync('*', { cwd });
  }
}
