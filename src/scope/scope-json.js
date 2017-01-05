/** @flow */
import pathlib from 'path';
import { writeFile } from '../utils';
import { Remote } from '../remotes';
import { SCOPE_JSON } from '../constants';

export function getPath(scopePath: string): string {
  return pathlib.join(scopePath, SCOPE_JSON);
}

export type ScopeJsonProps = {
  name: string,
  remotes?: { name: string, url: string };
};

export class ScopeJson {
  name: string;
  remotes: {[string]: string};

  constructor({ name, remotes }: ScopeJsonProps) {
    this.name = name;
    this.remotes = remotes || {};
  }

  toPlainObject() {
    return {
      name: this.name,
      remotes: this.remotes
    };
  }

  toJson(readable: boolean = true) {
    if (!readable) return JSON.stringify(this.toPlainObject());
    return JSON.stringify(this.toPlainObject(), null, 4);
  }

  addRemote(remote: Remote) {
    this.remotes[remote.name] = remote.host;
    return this;
  }

  rmRemote(name: string) {
    delete this.remotes[name];
    return this;
  }

  write(path: string) {
    return writeFile(pathlib.join(path, SCOPE_JSON), this.toJson());
  }

  static loadFromJson(json: string) {
    return new ScopeJson(JSON.parse(json));
  }
}
