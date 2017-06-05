// @flow
import R from 'ramda';
import glob from 'glob';
import path from 'path';
import { BitId as ComponentId } from 'bit-scope-client/bit-id';
import BitJson from 'bit-scope-client/bit-json';
import { COMPONENTS_DIRNAME, LATEST_BIT_VERSION, REMOTE_ALIAS_SIGN } from '../constants';
import Component from './component';

export default class ComponentsMap {
  targetDir: string;
  projectBitJson: BitJson;
  _map: { string?: { [string]: Component } };
  scopeName: ?string;

  constructor(targetDir: string, projectBitJson: BitJson, localScopeName: ?string) {
    this.targetDir = targetDir;
    this.projectBitJson = projectBitJson;
    this.scopeName = localScopeName;
    this._map = {};
  }

  addComponent(loc: string, bitJson: BitJson) {
    const separatorLocation = loc.lastIndexOf('/');
    const base = loc.slice(0, separatorLocation);
    const version = loc.slice(separatorLocation + 1);

    if (!this._map[base]) this._map[base] = {};

    this._map[base][version] = Component.create({
      loc,
      file: bitJson.getRequiredFile(),
      compiler: bitJson.compiler,
      dependencies: bitJson.getDependenciesArray(),
      localScopeName: this.scopeName,
    });
  }

  build(): Promise<ComponentsMap> {
    return new Promise((resolve, reject) => {
      glob('*/*/*/*', { cwd: this.targetDir }, (err, files) => {
        if (err) return reject(err);
        files.forEach((loc) => {
          const componentPath = path.join(this.targetDir, loc);
          const bitJson = BitJson.load(componentPath, this.projectBitJson);
          this.addComponent(loc, bitJson);
        });

        return resolve(this);
      });
    });
  }

  getComponent(componentId: ComponentId): ?Component {
    const scope = componentId.scope.startsWith(REMOTE_ALIAS_SIGN) ?
      componentId.scope.replace(REMOTE_ALIAS_SIGN, '') : componentId.scope;
    const base = `${componentId.box}/${componentId.name}/${scope}`;
    const version = componentId.version;
    if (version === LATEST_BIT_VERSION) return this.getLatestComponent(base);
    if (!Object.hasOwnProperty.call(this._map, base)) return null;
    if (!Object.hasOwnProperty.call(this._map[base], version)) return null;
    return this._map[base][version];
  }

  getLatestComponent(baseId: string): ?Component {
    if (!Object.hasOwnProperty.call(this._map, baseId)) return null;
    if (R.isEmpty(this._map[baseId])) return null;
    const maxInArr = R.reduce(R.max, null);
    const castArrToNumber = R.map(s => parseInt(s, 10));
    const versionsArr = castArrToNumber(R.keys(this._map[baseId]));
    const maxVersion = maxInArr(versionsArr).toString();
    return this._map[baseId][maxVersion];
  }

  forEach(func: Function): void {
    R.mapObjIndexed((versionsObj) => {
      R.mapObjIndexed((component) => {
        func(component);
      }, versionsObj);
    }, this._map);
  }

  map(func: Function): Component[] {
    return R.mapObjIndexed(versionsObj =>
      R.mapEachObjIndexed(component =>
        func(component),
      versionsObj),
    this._map);
  }

  getLatestComponents(): Component[] {
    const baseIds = R.keys(this._map);
    return baseIds.map(this.getLatestComponent.bind(this));
  }

  getLatestStagedComponents(): Component[] {
    return this.getLatestComponents().filter(c => c.isLocal);
  }

  isEmpty() {
    return !this._map || R.isEmpty(this._map);
  }

  static async create(projectRoot, projectBitJson, localScopeName): Promise<ComponentsMap> {
    const componentsDir = path.join(projectRoot, COMPONENTS_DIRNAME);
    const map = new ComponentsMap(componentsDir, projectBitJson, localScopeName);
    return map.build();
  }
}
