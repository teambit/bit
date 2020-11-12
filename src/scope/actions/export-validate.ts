import path from 'path';
import fs from 'fs-extra';
import glob from 'glob';
import { Scope } from '..';
import { PENDING_OBJECTS_DIR } from '../../constants';
import { mergeObjects } from '../component-ops/export-scope-components';
import { Action } from './action';
import logger from '../../logger/logger';
import ServerIsBusy from '../exceptions/server-is-busy';

type Options = { clientId: string };
const CLIENT_STALE_IN_MS = 1000 * 60 * 15; // 15m
const NUM_OF_RETRIES = 60;
const WAIT_BEFORE_RETRY_IN_MS = 1000;

/**
 * do not save anything. just make sure the objects can be merged and there are no conflicts.
 * once done, clear the objects from the memory so then they won't be used by mistake later on.
 * this also makes sure that non-external dependencies are not missing.
 */
export class ExportValidate implements Action<Options, void> {
  scope: Scope;
  clientId: string;
  async execute(scope: Scope, options: Options) {
    this.scope = scope;
    this.clientId = options.clientId;
    await this.waitIfNeeded();
    const objectList = await scope.readObjectsFromPendingDir(options.clientId);
    await mergeObjects(scope, objectList, true); // if fails, it throws merge-conflict/component-not-found
    scope.objects.clearCache();
  }

  private async waitIfNeeded() {
    let clientQueue = this.getClientsQueue();
    if (clientQueue[0] === this.clientId) return; // it's your turn
    logger.debug(`export-validate, waitIfNeeded - ${clientQueue.length} clients in queue (including current)`);
    for (let i = 0; i < NUM_OF_RETRIES; i += 1) {
      logger.debug(`export-validate, waitIfNeeded - ${i} out of ${NUM_OF_RETRIES}`);
      // eslint-disable-next-line no-await-in-loop
      await this.sleep(WAIT_BEFORE_RETRY_IN_MS);
      // eslint-disable-next-line no-await-in-loop
      await this.clearClientsIfStale();
      clientQueue = this.getClientsQueue();
      if (clientQueue[0] === this.clientId) {
        break;
      }
    }
    const nextClientCreatedTs = await this.clientCreatedTimestampMs(clientQueue[0]);
    throw new ServerIsBusy(clientQueue.length, nextClientCreatedTs ? this.msUntilStale(nextClientCreatedTs) : 0);
  }

  private async clearClientsIfStale() {
    const clientIds = this.getClientsQueue();
    const pendingDir = this.getPendingDir();
    await Promise.all(
      clientIds.map(async (clientId) => {
        if (clientId === this.clientId) return;
        const createdTime = await this.clientCreatedTimestampMs(clientId);
        if (!createdTime) return; // probably got deleted
        if (this.isStale(createdTime)) {
          const clientDir = path.join(pendingDir, clientId);
          await fs.remove(clientDir);
          logger.warn(`export-validate, clearClientsIfStale - removed stale client ${clientId} data`);
        }
      })
    );
  }

  private async clientCreatedTimestampMs(clientId: string): Promise<number | null> {
    const clientDir = path.join(this.getPendingDir(), clientId);
    try {
      const stat = await fs.stat(clientDir);
      return stat.ctimeMs;
    } catch (err) {
      if (err.code === 'ENOENT') return null; // got deleted already
      throw err;
    }
  }

  private getPendingDir() {
    return path.join(this.scope.path, PENDING_OBJECTS_DIR);
  }

  private isStale(createdTimeInMS: number): boolean {
    const msUntilStale = this.msUntilStale(createdTimeInMS);
    return msUntilStale < 0;
  }

  private msUntilStale(createdTimeInMS: number): number {
    const msSinceCreatedInMs = Date.now() - createdTimeInMS;
    return CLIENT_STALE_IN_MS - msSinceCreatedInMs;
  }

  private async sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private getClientsQueue(): string[] {
    const cwd = this.getPendingDir();
    const clientsIds = glob.sync('*', { cwd });
    if (!clientsIds.length) throw new Error(`pending-dir doesn't have any data`);
    if (!clientsIds.includes(this.clientId))
      throw new Error(`pending-dir doesn't have the client ${this.clientId} data`);
    return clientsIds.sort();
  }
}
