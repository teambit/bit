import path from 'path';
import fs from 'fs-extra';
import { REMOTE_REFS_DIR } from '../../constants';
import { Ref } from '../objects';

type Remote = Array<{ name: string; head: Ref }>;

export default class RemoteLanes {
  basePath: string;
  remotes: { [name: string]: Remote };
  constructor(scopePath: string) {
    this.basePath = path.join(scopePath, REMOTE_REFS_DIR);
    this.remotes = {};
  }
  async addEntry(remoteName: string, componentName: string, head?: Ref) {
    if (!remoteName) throw new TypeError('addEntry expects to get remoteName');
    if (!head) return; // do nothing
    if (!this.remotes[remoteName]) {
      await this.loadRemote(remoteName);
    }
    const existingComponent = this.remotes[remoteName].find(n => n.name === componentName);
    if (existingComponent) {
      existingComponent.head = head;
    } else {
      this.remotes[remoteName].push({ name: componentName, head });
    }
  }

  async getRef(remoteName: string, componentName: string): Promise<Ref | null> {
    if (!remoteName) throw new TypeError('getEntry expects to get remoteName');
    if (!this.remotes[remoteName]) {
      await this.loadRemote(remoteName);
    }
    const existingComponent = this.remotes[remoteName].find(n => n.name === componentName);
    if (!existingComponent) return null;
    return existingComponent.head;
  }

  async loadRemote(remoteName: string) {
    const remotePath = this.composeRemotePath(remoteName);
    try {
      const remoteFile = await fs.readJson(remotePath);
      this.remotes[remoteName] = remoteFile.map(({ name, head }) => ({ name, head: new Ref(head) }));
    } catch (err) {
      if (err.code === 'ENOENT') {
        this.remotes[remoteName] = [];
        return;
      }
      throw err;
    }
  }

  composeRemotePath(remoteName) {
    return path.join(this.basePath, remoteName);
  }

  async write() {
    return Promise.all(Object.keys(this.remotes).map(remoteName => this.writeRemoteFile(remoteName)));
  }

  async writeRemoteFile(remoteName) {
    const obj = this.remotes[remoteName].map(({ name, head }) => ({ name, head: head.toString() }));
    return fs.outputFile(this.composeRemotePath(remoteName), JSON.stringify(obj, null, 2));
  }
}
