import fs from 'fs-extra';
// @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
import pathlib from 'path';
import { DEFAULT_LANE } from '@teambit/lane-id';
import BitId from '../bit-id/bit-id';
import { SCOPE_JSON, SCOPE_JSONC } from '../constants';
import GeneralError from '../error/general-error';
import { Remote } from '../remotes';
import { cleanObject, writeFile } from '../utils';
import { ScopeJsonNotFound } from './exceptions';

export function getPath(scopePath: string): string {
  return pathlib.join(scopePath, SCOPE_JSON);
}

export function getHarmonyPath(scopePath: string): string {
  return pathlib.join(scopePath, SCOPE_JSONC);
}

export type ScopeJsonProps = {
  name: string;
  version: string;
  resolverPath?: string;
  hooksPath?: string;
  license?: string;
  groupName: string | null | undefined;
  remotes?: { name: string; url: string };
  lanes?: { current: string; tracking: TrackLane[]; new: string[] };
};

export type TrackLane = { localLane: string; remoteLane: string; remoteScope: string };

export class ScopeJson {
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  _name: string;
  version: string | null | undefined;
  resolverPath: string | null | undefined;
  hooksPath: string | undefined;
  license: string | null | undefined;
  remotes: { [key: string]: string };
  groupName: string;
  lanes: { current: string; tracking: TrackLane[]; new: string[] };
  hasChanged = false;

  constructor({ name, remotes, resolverPath, hooksPath, license, groupName, version, lanes }: ScopeJsonProps) {
    this.name = name;
    this.version = version;
    this.resolverPath = resolverPath;
    this.hooksPath = hooksPath;
    this.license = license;
    this.remotes = remotes || {};
    this.groupName = groupName || '';
    this.lanes = lanes || { current: DEFAULT_LANE, tracking: [], new: [] };
  }

  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  set name(suggestedName: string) {
    this._name = BitId.getValidScopeName(suggestedName);
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    return this;
  }

  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
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
      version: this.version,
      lanes: this.lanes,
    });
  }

  toJson(readable = true) {
    if (!readable) return JSON.stringify(this.toPlainObject());
    return JSON.stringify(this.toPlainObject(), null, 4);
  }

  set(key: string, val: string) {
    // eslint-disable-next-line no-prototype-builtins
    if (!this.hasOwnProperty(key)) throw new GeneralError(`unknown key ${key}`);
    this[key] = val;
    return this;
  }

  get(key: string): string {
    // eslint-disable-next-line no-prototype-builtins
    if (!this.hasOwnProperty(key)) throw new GeneralError(`unknown key ${key}`);
    return this[key];
  }

  del(key: string): string {
    // eslint-disable-next-line no-prototype-builtins
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

  trackLane(trackLaneData: TrackLane) {
    const existing = this.getTrackLane(trackLaneData.localLane);
    if (existing) {
      existing.remoteLane = trackLaneData.remoteLane;
      existing.remoteScope = trackLaneData.remoteScope;
    } else {
      this.lanes.tracking.push(trackLaneData);
    }

    this.hasChanged = true;
  }
  removeTrackLane(localLane: string) {
    const index = this.lanes.tracking.findIndex((t) => t.localLane === localLane);
    if (index === -1) return;
    this.lanes.tracking.splice(index, 1);
    this.hasChanged = true;
  }
  private getTrackLane(localLane: string): TrackLane | undefined {
    return this.lanes.tracking.find((t) => t.localLane === localLane);
  }
  setCurrentLane(laneName: string): void {
    if (this.lanes.current !== laneName) {
      this.lanes.current = laneName;
      this.hasChanged = true;
    }
  }
  setLaneAsNew(laneName: string) {
    if (!this.lanes.new) this.lanes.new = [];
    this.lanes.new.push(laneName);
    this.hasChanged = true;
  }
  removeLaneFromNew(laneName: string) {
    if (!this.lanes.new || !this.lanes.new.length) return;
    this.lanes.new = this.lanes.new.filter((l) => l !== laneName);
    this.hasChanged = true;
  }
  async writeIfChanged(path: string) {
    if (this.hasChanged) {
      await this.write(path);
    }
  }

  static loadFromJson(json: string, scopeJsonPath: string): ScopeJson {
    let jsonParsed: ScopeJsonProps;
    try {
      jsonParsed = JSON.parse(json);
    } catch (err) {
      throw new GeneralError(`unable to parse the scope.json file located at "${scopeJsonPath}".
edit the file to fix the error, or delete it and run "bit init" to recreate it`);
    }
    return new ScopeJson(jsonParsed);
  }

  static async loadFromFile(scopeJsonPath: string): Promise<ScopeJson> {
    let rawScopeJson;
    try {
      rawScopeJson = await fs.readFile(scopeJsonPath);
    } catch (err: any) {
      if (err.code === 'ENOENT') throw new ScopeJsonNotFound(scopeJsonPath);
      throw err;
    }
    return ScopeJson.loadFromJson(rawScopeJson.toString(), scopeJsonPath);
  }

  getPopulatedLicense(): Promise<string | null | undefined> {
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    if (!this.get('license') || !fs.existsSync(this.get('license'))) return Promise.resolve();
    return fs.readFile(this.get('license')).then((license) => license.toString());
  }
}
