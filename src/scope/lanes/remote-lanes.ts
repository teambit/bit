import fs from 'fs-extra';
import path from 'path';
import pMapSeries from 'p-map-series';
import { LaneId } from '@teambit/lane-id';
import { compact } from 'lodash';
import { Mutex } from 'async-mutex';
import { BitId } from '../../bit-id';
import { PREVIOUS_DEFAULT_LANE, REMOTE_REFS_DIR } from '../../constants';
import { glob } from '../../utils';
import { Lane, ModelComponent } from '../models';
import { LaneComponent } from '../models/lane';
import { Ref } from '../objects';

type Lanes = { [laneName: string]: LaneComponent[] };

/**
 * each lane holds components and hashes, which are the heads of the remote
 */
export default class RemoteLanes {
  basePath: string;
  remotes: { [remoteName: string]: Lanes };
  writeMutex = new Mutex();
  constructor(scopePath: string) {
    this.basePath = path.join(scopePath, REMOTE_REFS_DIR);
    this.remotes = {};
  }
  async addEntry(remoteLaneId: LaneId, componentId: BitId, head?: Ref) {
    if (!remoteLaneId) throw new TypeError('addEntry expects to get remoteLaneId');
    if (!head) return; // do nothing
    const remoteLane = await this.getRemoteLane(remoteLaneId);
    this.pushToRemoteLane(remoteLane, componentId, head);
  }

  private pushToRemoteLane(remoteLane: LaneComponent[], componentId: BitId, head: Ref) {
    const existingComponent = remoteLane.find((n) => n.id.isEqualWithoutVersion(componentId));
    if (existingComponent) {
      existingComponent.head = head;
    } else {
      remoteLane.push({ id: componentId, head });
    }
  }

  async addEntriesFromModelComponents(remoteLaneId: LaneId, components: ModelComponent[]) {
    const remoteLane = await this.getRemoteLane(remoteLaneId);
    components.forEach((component) => {
      if (!component.remoteHead) return;
      this.pushToRemoteLane(remoteLane, component.toBitId(), component.remoteHead);
    });
  }

  async getRef(remoteLaneId: LaneId, bitId: BitId): Promise<Ref | null> {
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

  async getRefsFromAllLanesOnScope(scopeName: string, bitId: BitId): Promise<Ref[]> {
    const allLaneIdOfScope = await this.getAllRemoteLaneIdsOfScope(scopeName);
    const results = await pMapSeries(allLaneIdOfScope, (laneId) => this.getRef(laneId, bitId));
    return compact(results);
  }

  async getRefsFromAllLanes(bitId: BitId): Promise<Ref[]> {
    const allLaneIds = await this.getAllRemoteLaneIds();
    const results = await pMapSeries(allLaneIds, (laneId) => this.getRef(laneId, bitId));
    return compact(results);
  }

  async getRemoteBitIds(remoteLaneId: LaneId): Promise<BitId[]> {
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
        id: new BitId({ scope: id.scope, name: id.name }),
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
    return matches.map((match) => LaneId.from(match, scopeName));
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

  async write() {
    await this.writeMutex.runExclusive(() =>
      Promise.all(Object.keys(this.remotes).map((remoteName) => this.writeRemoteLanes(remoteName)))
    );
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
    const obj = this.remotes[remoteName][laneName].map(({ id, head }) => ({
      id: { scope: id.scope, name: id.name },
      head: head.toString(),
    }));
    return fs.outputFile(this.composeRemoteLanePath(remoteName, laneName), JSON.stringify(obj, null, 2));
  }
}
