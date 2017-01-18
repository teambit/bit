/** @flow */
import path from 'path';
import { GLOBAL_CONFIG, GLOBAL_REMOTES } from '../constants';
import { writeFile, readFile } from '../utils';
import { Remotes, Remote } from '../remotes';

export default class GlobalRemotes {
  remotes: {[string]: string};

  constructor(remotes: {[string]: string}) {
    this.remotes = remotes;
  }
  
  addRemote(remote: Remote) {
    this.remotes[remote.name] = remote.host;
    return this;
  }

  rmRemote(name: string) {
    delete this.remotes[name];
    return this;
  }

  toJson(readable: boolean = true) {
    if (!readable) return JSON.stringify(this.toPlainObject());
    return JSON.stringify(this.toPlainObject(), null, 4);
  }

  asRemotes() {
    return Remotes.load(this.remotes);
  }

  toPlainObject() {
    return this.remotes;
  }

  write() {
    return writeFile(path.join(GLOBAL_CONFIG, GLOBAL_REMOTES), this.toJson());
  }

  static load() {
    return readFile(path.join(GLOBAL_CONFIG, GLOBAL_REMOTES))
      .then(contents => new GlobalRemotes(JSON.parse(contents.toString('utf8'))))
      .catch((err) => {
        if (err.code !== 'ENOENT') return err;
        const globalRemotes = new GlobalRemotes({});
        return globalRemotes.write()
          .then(() => globalRemotes);
      });
  }
}
