import { ComponentID } from '@teambit/component-id';
import fs from 'fs-extra';
import path from 'path';
import pMapSeries from 'p-map-series';
import { LaneId } from '@teambit/lane-id';
import { compact, set } from 'lodash';
import { Mutex } from 'async-mutex';
import { PREVIOUS_DEFAULT_LANE, REMOTE_REFS_DIR } from '@teambit/legacy.constants';
import { glob } from '@teambit/legacy.utils';
import { Lane, ModelComponent } from '../models';
import { LaneComponent } from '../models/lane';
import { Ref } from '../objects';
import { logger } from '@teambit/legacy.logger';

type Lanes = { [laneName: string]: LaneComponent[] };

/**
 * each lane holds components and hashes, which are the heads of the remote
 */
export default class RemoteLanes {
  basePath: string;
  private remotes: { [remoteName: string]: Lanes } = {};
  private changed: { [remoteName: string]: { [laneName: string]: boolean } } = {};
  writeMutex = new Mutex();
  constructor(scopePath: string) {
    this.basePath = path.join(scopePath, REMOTE_REFS_DIR);
  }
  async addEntry(remoteLaneId: LaneId, componentId: ComponentID, head?: Ref) {
    if (!remoteLaneId) throw new TypeError('addEntry expects to get remoteLaneId');
    if (!head) return; // do nothing
    const remoteLane = await this.getRemoteLane(remoteLaneId);
    this.pushToRemoteLane(remoteLane, componentId, head, remoteLaneId);
  }

  removeFromCacheByFilePath(filePath: string) {
    const { laneName, remoteName } = this.decomposeRemoteLanePath(filePath);
    logger.debug(`RemoteLanes, removing refs from the cache: ${remoteName}/${laneName}`);
    delete this.remotes[remoteName]?.[laneName];
  }

  private pushToRemoteLane(remoteLane: LaneComponent[], componentId: ComponentID, head: Ref, remoteLaneId: LaneId) {
    const existingComponent = remoteLane.find((n) => n.id.isEqualWithoutVersion(componentId));
    if (existingComponent) {
      existingComponent.head = head;
    } else {
      remoteLane.push({ id: componentId, head });
    }
    set(this.changed, [remoteLaneId.scope, remoteLaneId.name], true);
  }

  async addEntriesFromModelComponents(remoteLaneId: LaneId, components: ModelComponent[]) {
    const remoteLane = await this.getRemoteLane(remoteLaneId);
    components.forEach((component) => {
      if (!component.remoteHead) return;
      this.pushToRemoteLane(remoteLane, component.toComponentId(), component.remoteHead, remoteLaneId);
    });
  }

  async getRef(remoteLaneId: LaneId, bitId: ComponentID): Promise<Ref | null> {
    if (!remoteLaneId) throw new TypeError('getEntry expects to get remoteLaneId');
    if (!this.remotes[remoteLaneId.scope] || !this.remotes[remoteLaneId.scope][remoteLaneId.name]) {
      await this.loadRemoteLane(remoteLaneId);
    }
    const remoteLane = this.remotes[remoteLaneId.scope][remoteLaneId.name];
    const existingComponent = remoteLane.find((n) => n.id.isEqualWithoutVersion(bitId));
    if (!existingComponent) return null;
    return existingComponent.head;
  }

  async getRemoteLane(remoteLaneId: LaneId): Promise<LaneComponent[]> {
    if (!this.remotes[remoteLaneId.scope] || !this.remotes[remoteLaneId.scope][remoteLaneId.name]) {
      await this.loadRemoteLane(remoteLaneId);
    }
    return this.remotes[remoteLaneId.scope][remoteLaneId.name];
  }

  async getRefsFromAllLanesOnScope(scopeName: string, bitId: ComponentID): Promise<Ref[]> {
    const allLaneIdOfScope = await this.getAllRemoteLaneIdsOfScope(scopeName);
    const results = await pMapSeries(allLaneIdOfScope, (laneId) => this.getRef(laneId, bitId));

    return compact(results);
  }

  async getRefsFromAllLanes(bitId: ComponentID): Promise<Ref[]> {
    const allLaneIds = await this.getAllRemoteLaneIds();
    const results = await pMapSeries(allLaneIds, (laneId) => this.getRef(laneId, bitId));
    return compact(results);
  }

  async getRefsPerLaneId(compId: ComponentID): Promise<{ [laneIdStr: string]: Ref }> {
    const allLaneIds = await this.getAllRemoteLaneIds();
    const results = {};
    await pMapSeries(allLaneIds, async (laneId) => {
      const ref = await this.getRef(laneId, compId);
      if (ref) {
        results[laneId.toString()] = ref;
      }
    });
    return results;
  }

  async getRemoteBitIds(remoteLaneId: LaneId): Promise<ComponentID[]> {
    const remoteLane = await this.getRemoteLane(remoteLaneId);
    return remoteLane.map((item) => item.id.changeVersion(item.head.toString()));
  }

  async loadRemoteLane(remoteLaneId: LaneId) {
    const remoteName = remoteLaneId.scope;
    const laneName = remoteLaneId.name;
    const remoteLanePath = this.composeRemoteLanePath(remoteName, laneName);
    try {
      const remoteFile = await fs.readJson(remoteLanePath);
      if (!this.remotes[remoteName]) this.remotes[remoteName] = {};
      this.remotes[remoteName][laneName] = remoteFile.map(({ id, head }) => ({
        id: ComponentID.fromObject({ scope: id.scope, name: id.name }),
        head: new Ref(head),
      }));
    } catch (err: any) {
      if (err.code === 'ENOENT') {
        if (!this.remotes[remoteName]) this.remotes[remoteName] = {};
        this.remotes[remoteName][laneName] = [];
        return;
      }
      throw err;
    }
  }

  async getAllRemoteLaneIds(): Promise<LaneId[]> {
    const matches = await glob(path.join('*', '*'), { cwd: this.basePath });
    // in the future, lane-name might have slashes, so until the first slash is the scope.
    // the rest are the name
    return matches
      .map((match) => match.split(path.sep))
      .map(([head, ...tail]) => LaneId.from(tail.join('/'), head))
      .filter((remoteLaneId) => !remoteLaneId.isDefault() && remoteLaneId.name !== PREVIOUS_DEFAULT_LANE);
  }

  async getAllRemoteLaneIdsOfScope(scopeName: string): Promise<LaneId[]> {
    const matches = await glob(path.join('*'), { cwd: path.join(this.basePath, scopeName) });
    return matches.map((match) => LaneId.from(match, scopeName)).filter((laneId) => !laneId.isDefault());
  }

  async syncWithLaneObject(remoteName: string, lane: Lane) {
    const remoteLaneId = LaneId.from(lane.name, remoteName);
    if (!this.remotes[remoteName] || !this.remotes[remoteName][lane.name]) {
      await this.loadRemoteLane(remoteLaneId);
    }
    await Promise.all(lane.components.map((component) => this.addEntry(remoteLaneId, component.id, component.head)));
  }

  private composeRemoteLanePath(remoteName: string, laneName: string) {
    return path.join(this.basePath, remoteName, laneName);
  }
  private decomposeRemoteLanePath(filePath: string): { remoteName: string; laneName: string } {
    const dir = path.dirname(filePath);
    return {
      remoteName: path.basename(dir),
      laneName: path.basename(filePath),
    };
  }

  async write() {
    const numOfChangedRemotes = Object.keys(this.changed).length;
    if (!numOfChangedRemotes) {
      logger.debug(`remote-lanes.write, nothing has changed, no need to write`);
      return;
    }
    await this.writeMutex.runExclusive(async () => {
      logger.debug(`remote-lanes.write, start, ${numOfChangedRemotes} remotes`);
      await Promise.all(Object.keys(this.remotes).map((remoteName) => this.writeRemoteLanes(remoteName)));
      logger.debug(`remote-lanes.write, end, ${numOfChangedRemotes} remotes`);
    });
  }

  async renameRefByNewScopeName(laneName: string, oldScopeName: string, newScopeName: string) {
    const remoteLaneId = LaneId.from(laneName, oldScopeName);
    const remoteLane = await this.getRemoteLane(remoteLaneId);
    this.remotes[newScopeName] = { ...this.remotes[newScopeName], [laneName]: remoteLane };
    delete this.remotes[oldScopeName][laneName];
  }

  async renameRefByNewLaneName(oldLaneName: string, newLaneName: string, scopeName: string) {
    const remoteLaneId = LaneId.from(oldLaneName, scopeName);
    const remoteLane = await this.getRemoteLane(remoteLaneId);
    this.remotes[scopeName] = { ...this.remotes[scopeName], [newLaneName]: remoteLane };
    delete this.remotes[scopeName][oldLaneName];
  }

  private async writeRemoteLanes(remoteName: string) {
    return Promise.all(
      Object.keys(this.remotes[remoteName]).map((laneName) => this.writeRemoteLaneFile(remoteName, laneName))
    );
  }

  private async writeRemoteLaneFile(remoteName: string, laneName: string) {
    if (!this.changed[remoteName]?.[laneName]) return;
    const obj = this.remotes[remoteName][laneName].map(({ id, head }) => ({
      id: { scope: id.scope, name: id.fullName },
      head: head.toString(),
    }));
    await fs.outputFile(this.composeRemoteLanePath(remoteName, laneName), JSON.stringify(obj, null, 2));
    delete this.changed[remoteName][laneName];
  }
}
