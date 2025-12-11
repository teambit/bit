import fs from 'fs-extra';
// @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
import pathlib from 'path';
import { BitError } from '@teambit/bit-error';
import { DEFAULT_LANE } from '@teambit/lane-id';
import { BitId } from '@teambit/legacy-bit-id';
import { SCOPE_JSON, SCOPE_JSONC } from '@teambit/legacy.constants';
import type { Remote } from '@teambit/scope.remotes';
import type { PathOsBasedAbsolute } from '@teambit/legacy.utils';
import { cleanObject, writeFile } from '@teambit/legacy.utils';
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
  config?: Record<string, string>;
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
  lanes: { tracking: TrackLane[]; new: string[] };
  hasChanged = false;
  config?: Record<string, string>;

  constructor(
    { name, remotes, resolverPath, hooksPath, license, groupName, version, lanes, config }: ScopeJsonProps,
    readonly scopeJsonPath: PathOsBasedAbsolute
  ) {
    this.name = name;
    this.version = version;
    this.resolverPath = resolverPath;
    this.hooksPath = hooksPath;
    this.license = license;
    this.remotes = remotes || {};
    this.groupName = groupName || '';
    this.lanes = lanes || { current: DEFAULT_LANE, tracking: [], new: [] };
    this.config = config;
  }

  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  set name(suggestedName: string) {
    this._name = BitId.getValidScopeName(suggestedName);
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
      config: this.config,
    });
  }

  toJson(readable = true) {
    if (!readable) return JSON.stringify(this.toPlainObject());
    return JSON.stringify(this.toPlainObject(), null, 4);
  }

  set(key: string, val: string) {
    // eslint-disable-next-line no-prototype-builtins
    if (!this.hasOwnProperty(key)) throw new BitError(`unknown key ${key}`);
    this[key] = val;
    return this;
  }

  get(key: string): string {
    // eslint-disable-next-line no-prototype-builtins
    if (!this.hasOwnProperty(key)) throw new BitError(`unknown key ${key}`);
    return this[key];
  }

  del(key: string): string {
    // eslint-disable-next-line no-prototype-builtins
    if (!this.hasOwnProperty(key)) throw new BitError(`unknown key ${key}`);
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

  setConfig(key: string, value: string) {
    if (!this.config) this.config = {};
    this.config[key] = value;
    this.hasChanged = true;
  }
  rmConfig(key: string) {
    if (!this.config) return;
    delete this.config[key];
    this.hasChanged = true;
  }

  async write() {
    return writeFile(this.scopeJsonPath, this.toJson());
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
  async writeIfChanged() {
    if (this.hasChanged) {
      await this.write();
    }
  }

  static loadFromJson(json: string, scopeJsonPath: string): ScopeJson {
    let jsonParsed: ScopeJsonProps;
    try {
      jsonParsed = JSON.parse(json);
    } catch {
      throw new BitError(`unable to parse the scope.json file located at "${scopeJsonPath}".
edit the file to fix the error, or delete it and run "bit init" to recreate it`);
    }
    return new ScopeJson(jsonParsed, scopeJsonPath);
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
