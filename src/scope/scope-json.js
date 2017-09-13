/** @flow */
import pathlib from 'path';
import { writeFile, cleanObject, readFile, existsSync } from '../utils';
import { Remote } from '../remotes';
import { SCOPE_JSON } from '../constants';

export function getPath(scopePath: string): string {
  return pathlib.join(scopePath, SCOPE_JSON);
}

export type ScopeJsonProps = {
  name: string,
  resolverPath?: string,
  license?: string,
  groupName: ?string,
  remotes?: { name: string, url: string }
};

export class ScopeJson {
  _name: string;
  resolverPath: ?string;
  license: ?string;
  remotes: { [string]: string };
  groupName: string;

  constructor({ name, remotes, resolverPath, license, groupName }: ScopeJsonProps) {
    this.name = name;
    this.resolverPath = resolverPath;
    this.license = license;
    this.remotes = remotes || {};
    this.groupName = groupName || '';
  }

  set name(suggestedName: string) {
    suggestedName = suggestedName.toLowerCase();
    const cleanName = suggestedName
      .split('')
      .map((char) => {
        if (/^[$\-_!.a-z0-9]+$/.test(char)) return char;
        return '';
      })
      .join('');

    if (!cleanName) {
      throw new Error('scope name created by directory name have to contains at least one character or number');
    }

    this._name = cleanName;
    return this;
  }

  get name(): string {
    return this._name;
  }
  toPlainObject() {
    return cleanObject({
      name: this.name,
      remotes: this.remotes,
      resolverPath: this.resolverPath,
      license: this.license,
      groupName: this.groupName
    });
  }

  toJson(readable: boolean = true) {
    if (!readable) return JSON.stringify(this.toPlainObject());
    return JSON.stringify(this.toPlainObject(), null, 4);
  }

  set(key: string, val: string) {
    if (!this.hasOwnProperty(key)) throw new Error(`unknown key ${key}`);
    this[key] = val;
    return this;
  }

  get(key: string): string {
    if (!this.hasOwnProperty(key)) throw new Error(`unknown key ${key}`);
    return this[key];
  }

  del(key: string): string {
    if (!this.hasOwnProperty(key)) throw new Error(`unknown key ${key}`);
    return this[key];
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

  getPopulatedLicense(): Promise<?string> {
    if (!this.get('license') || !existsSync(this.get('license'))) return Promise.resolve();
    return readFile(this.get('license')).then(license => license.toString());
  }
}
