import fs from 'fs-extra';
import * as path from 'path';

import { GLOBAL_CONFIG, GLOBAL_REMOTES } from '../constants';
import Remote from '../remotes/remote';
import { writeFile } from '../utils';

export default class GlobalRemotes {
  remotes: { [key: string]: string };

  constructor(remotes: { [key: string]: string }) {
    this.remotes = remotes;
  }

  addRemote(remote: Remote) {
    this.remotes[remote.name] = remote.host;
    return this;
  }

  rmRemote(name: string): boolean {
    if (!this.remotes[name]) return false;
    delete this.remotes[name];
    return true;
  }

  toJson(readable = true) {
    if (!readable) return JSON.stringify(this.toPlainObject());
    return JSON.stringify(this.toPlainObject(), null, 4);
  }

  toPlainObject() {
    return this.remotes;
  }

  write() {
    return writeFile(path.join(GLOBAL_CONFIG, GLOBAL_REMOTES), this.toJson());
  }

  static load(): Promise<GlobalRemotes> {
    return fs
      .readFile(path.join(GLOBAL_CONFIG, GLOBAL_REMOTES))
      .then((contents) => new GlobalRemotes(JSON.parse(contents.toString('utf8'))))
      .catch((err) => {
        if (err.code !== 'ENOENT') return err;
        const globalRemotes = new GlobalRemotes({});
        return globalRemotes.write().then(() => globalRemotes);
      });
  }
}
