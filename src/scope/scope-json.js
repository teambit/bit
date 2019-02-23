/** @flow */
import fs from 'fs-extra';
import pathlib from 'path';
import { writeFile, cleanObject } from '../utils';
import { Remote } from '../remotes';
import { SCOPE_JSON } from '../constants';
import BitId from '../bit-id/bit-id';
import GeneralError from '../error/general-error';
import { ScopeJsonNotFound } from './exceptions';

export function getPath(scopePath: string): string {
  return pathlib.join(scopePath, SCOPE_JSON);
}

export type ScopeJsonProps = {
  name: string,
  version: string,
  resolverPath?: string,
  license?: string,
  groupName: ?string,
  remotes?: { name: string, url: string }
};

export class ScopeJson {
  _name: string;
  version: ?string;
  resolverPath: ?string;
  license: ?string;
  remotes: { [string]: string };
  groupName: string;

  constructor({ name, remotes, resolverPath, license, groupName, version }: ScopeJsonProps) {
    this.name = name;
    this.version = version;
    this.resolverPath = resolverPath;
    this.license = license;
    this.remotes = remotes || {};
    this.groupName = groupName || '';
  }

  set name(suggestedName: string) {
    this._name = BitId.getValidScopeName(suggestedName);
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
      groupName: this.groupName,
      version: this.version
    });
  }

  toJson(readable: boolean = true) {
    if (!readable) return JSON.stringify(this.toPlainObject());
    return JSON.stringify(this.toPlainObject(), null, 4);
  }

  set(key: string, val: string) {
    if (!this.hasOwnProperty(key)) throw new GeneralError(`unknown key ${key}`);
    this[key] = val;
    return this;
  }

  get(key: string): string {
    if (!this.hasOwnProperty(key)) throw new GeneralError(`unknown key ${key}`);
    return this[key];
  }

  del(key: string): string {
    if (!this.hasOwnProperty(key)) throw new GeneralError(`unknown key ${key}`);
    return this[key];
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

  async write(path: string) {
    return writeFile(pathlib.join(path, SCOPE_JSON), this.toJson());
  }

  static loadFromJson(json: string): ScopeJson {
    return new ScopeJson(JSON.parse(json));
  }

  static async loadFromFile(scopeJsonPath: string): Promise<ScopeJson> {
    let rawScopeJson;
    try {
      rawScopeJson = await fs.readFile(scopeJsonPath);
    } catch (err) {
      if (err.code === 'ENOENT') throw new ScopeJsonNotFound(scopeJsonPath);
      throw err;
    }
    return ScopeJson.loadFromJson(rawScopeJson.toString());
  }

  getPopulatedLicense(): Promise<?string> {
    if (!this.get('license') || !fs.existsSync(this.get('license'))) return Promise.resolve();
    return fs.readFile(this.get('license')).then(license => license.toString());
  }
}
