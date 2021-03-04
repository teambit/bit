import fs from 'fs-extra';
import path from 'path';
import R from 'ramda';
import { Mutex } from 'async-mutex';
import { BitId } from '../../bit-id';
import { REMOTE_REFS_DIR } from '../../constants';
import { RemoteLaneId } from '../../lane-id/lane-id';
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
  async addEntry(remoteLaneId: RemoteLaneId, componentId: BitId, head?: Ref) {
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

  async addEntriesFromModelComponents(remoteLaneId: RemoteLaneId, components: ModelComponent[]) {
    const remoteLane = await this.getRemoteLane(remoteLaneId);
    components.forEach((component) => {
      if (!component.remoteHead) return;
      this.pushToRemoteLane(remoteLane, component.toBitId(), component.remoteHead);
    });
  }

  async getRef(remoteLaneId: RemoteLaneId, bitId: BitId): Promise<Ref | null> {
    if (!remoteLaneId) throw new TypeError('getEntry expects to get remoteLaneId');
    if (!this.remotes[remoteLaneId.scope] || !this.remotes[remoteLaneId.scope][remoteLaneId.name]) {
      await this.loadRemoteLane(remoteLaneId);
    }
    const remoteLane = this.remotes[remoteLaneId.scope][remoteLaneId.name];
    const existingComponent = remoteLane.find((n) => n.id.isEqualWithoutVersion(bitId));
    if (!existingComponent) return null;
    return existingComponent.head;
  }

  async getRemoteLane(remoteLaneId: RemoteLaneId): Promise<LaneComponent[]> {
    if (!this.remotes[remoteLaneId.scope] || !this.remotes[remoteLaneId.scope][remoteLaneId.name]) {
      await this.loadRemoteLane(remoteLaneId);
    }
    return this.remotes[remoteLaneId.scope][remoteLaneId.name];
  }

  async getRemoteBitIds(remoteLaneId: RemoteLaneId): Promise<BitId[]> {
    const remoteLane = await this.getRemoteLane(remoteLaneId);
    return remoteLane.map((item) => item.id.changeVersion(item.head.toString()));
  }

  async loadRemoteLane(remoteLaneId: RemoteLaneId) {
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
    } catch (err) {
      if (err.code === 'ENOENT') {
        if (!this.remotes[remoteName]) this.remotes[remoteName] = {};
        this.remotes[remoteName][laneName] = [];
        return;
      }
      throw err;
    }
  }

  async getAllRemoteLaneIds(): Promise<RemoteLaneId[]> {
    const matches = await glob(path.join('*', '*'), { cwd: this.basePath });
    return matches.map((match) => {
      const split = match.split(path.sep);
      // in the future, lane-name might have slashes, so until the first slash is the scope.
      // the rest are the name
      return RemoteLaneId.from(R.tail(split).join('/'), R.head(split));
    });
  }

  async syncWithLaneObject(remoteName: string, lane: Lane) {
    const remoteLaneId = RemoteLaneId.from(lane.name, remoteName);
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
