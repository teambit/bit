import path from 'path';
import fs from 'fs-extra';
import R from 'ramda';
import { REMOTE_REFS_DIR } from '../../constants';
import { Ref } from '../objects';
import LaneId from '../../lane-id/lane-id';
import { Lane } from '../models';
import { BitId } from '../../bit-id';
import { LaneComponent } from '../models/lane';
import { RemoteLaneId } from '../../lane-id/lane-id';
import { glob } from '../../utils';

type Lanes = { [laneName: string]: LaneComponent[] };

export default class RemoteLanes {
  basePath: string;
  remotes: { [remoteName: string]: Lanes };
  constructor(scopePath: string) {
    this.basePath = path.join(scopePath, REMOTE_REFS_DIR);
    this.remotes = {};
  }
  async addEntry(remoteName: string, laneId: LaneId, componentId: BitId, head?: Ref) {
    if (!remoteName) throw new TypeError('addEntry expects to get remoteName');
    if (!laneId) throw new TypeError('addEntry expects to get LaneId');
    if (!head) return; // do nothing
    const remoteLane = await this.getRemoteLane(remoteName, laneId);
    const existingComponent = remoteLane.find(n => n.id.isEqualWithoutVersion(componentId));
    if (existingComponent) {
      existingComponent.head = head;
    } else {
      remoteLane.push({ id: componentId, head });
    }
  }

  async getRef(remoteName: string, laneId: LaneId, bitId: BitId): Promise<Ref | null> {
    if (!remoteName) throw new TypeError('getEntry expects to get remoteName');
    if (!laneId) throw new TypeError('getEntry expects to get laneId');
    if (!this.remotes[remoteName] || !this.remotes[remoteName][laneId.name]) {
      await this.loadRemoteLane(remoteName, laneId);
    }
    const remoteLane = this.remotes[remoteName][laneId.name];
    const existingComponent = remoteLane.find(n => n.id.isEqualWithoutVersion(bitId));
    if (!existingComponent) return null;
    return existingComponent.head;
  }

  async getRemoteLane(remoteName: string, laneId: LaneId): Promise<LaneComponent[]> {
    if (!this.remotes[remoteName] || !this.remotes[remoteName][laneId.name]) {
      await this.loadRemoteLane(remoteName, laneId);
    }
    return this.remotes[remoteName][laneId.name];
  }

  async getRemoteBitIds(remoteName: string, laneId: LaneId): Promise<BitId[]> {
    const remoteLane = await this.getRemoteLane(remoteName, laneId);
    return remoteLane.map(item => item.id.changeVersion(item.head.toString()));
  }

  async loadRemoteLane(remoteName: string, laneId: LaneId) {
    const remoteLanePath = this.composeRemoteLanePath(remoteName, laneId.name);
    try {
      const remoteFile = await fs.readJson(remoteLanePath);
      if (!this.remotes[remoteName]) this.remotes[remoteName] = {};
      this.remotes[remoteName][laneId.name] = remoteFile.map(({ id, head }) => ({
        id: new BitId({ scope: id.scope, name: id.name }),
        head: new Ref(head)
      }));
    } catch (err) {
      if (err.code === 'ENOENT') {
        if (!this.remotes[remoteName]) this.remotes[remoteName] = {};
        this.remotes[remoteName][laneId.name] = [];
        return;
      }
      throw err;
    }
  }

  async getAllRemoteLaneIds(): Promise<RemoteLaneId[]> {
    const matches = await glob(path.join('*', '*'), { cwd: this.basePath });
    return matches.map(match => {
      const split = match.split(path.sep);
      // in the future, lane-name might have slashes, so until the first slash is the scope.
      // the rest are the name
      return RemoteLaneId.from(R.tail(split).join('/'), R.head(split));
    });
  }

  async syncWithLaneObject(remoteName: string, lane: Lane) {
    const laneId = lane.toLaneId();
    if (!this.remotes[remoteName] || !this.remotes[remoteName][laneId.name]) {
      await this.loadRemoteLane(remoteName, laneId);
    }
    await Promise.all(
      lane.components.map(component => this.addEntry(remoteName, laneId, component.id, component.head))
    );
  }

  composeRemoteLanePath(remoteName: string, laneName: string) {
    return path.join(this.basePath, remoteName, laneName);
  }

  async write() {
    return Promise.all(Object.keys(this.remotes).map(remoteName => this.writeRemoteLanes(remoteName)));
  }

  async writeRemoteLanes(remoteName: string) {
    return Promise.all(
      Object.keys(this.remotes[remoteName]).map(laneName => this.writeRemoteLaneFile(remoteName, laneName))
    );
  }

  async writeRemoteLaneFile(remoteName: string, laneName: string) {
    const obj = this.remotes[remoteName][laneName].map(({ id, head }) => ({
      id: { scope: id.scope, name: id.name },
      head: head.toString()
    }));
    return fs.outputFile(this.composeRemoteLanePath(remoteName, laneName), JSON.stringify(obj, null, 2));
  }
}
