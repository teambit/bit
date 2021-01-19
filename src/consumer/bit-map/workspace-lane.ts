import fs from 'fs-extra';
import path from 'path';

import { BitId, BitIds } from '../../bit-id';
import { WORKSPACE_LANES_DIR } from '../../constants';

/**
 * each lane holds hashes per component-id. this hash is the checked out version of the current user.
 * the data is not synced by git and available only to the current user.
 * once a lane is exported, the hash replaces the version on .bitmap and then it gets synched
 */
export default class WorkspaceLane {
  lanePath: string;
  laneName: string;
  ids: BitIds;
  constructor(lanePath: string, laneName: string, ids: BitIds) {
    this.lanePath = lanePath;
    this.laneName = laneName;
    this.ids = ids;
  }
  addEntry(componentId: BitId, replaceIgnoreVersion = true) {
    if (!componentId.version) return; // do nothing
    const existing = this.ids.search(componentId);
    if (existing) return;
    const existingDiffVersion = this.ids.searchWithoutVersion(componentId);
    if (existingDiffVersion && replaceIgnoreVersion) {
      this.ids = this.ids.removeIfExistWithoutVersion(existingDiffVersion);
    }
    this.ids.push(componentId);
  }
  removeEntry(componentId: BitId) {
    this.ids = this.ids.removeIfExist(componentId);
  }

  reset() {
    this.ids = new BitIds();
  }

  getIds(): BitIds {
    return this.ids;
  }

  static load(laneName: string, scopePath: string): WorkspaceLane {
    const lanePath = path.join(scopePath, WORKSPACE_LANES_DIR, laneName);
    const loadIds = () => {
      try {
        const laneFile = fs.readJsonSync(lanePath);
        return BitIds.fromArray(laneFile.map((id) => new BitId(id)));
      } catch (err) {
        if (err.code === 'ENOENT') {
          return new BitIds();
        }
        throw err;
      }
    };
    const ids = loadIds();
    return new WorkspaceLane(lanePath, laneName, ids);
  }

  async write() {
    const obj = this.ids.map((id) => ({ scope: id.scope, name: id.name, version: id.version }));
    return fs.outputFile(this.lanePath, JSON.stringify(obj, null, 2));
  }
}
