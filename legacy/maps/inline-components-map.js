// @flow
import R from 'ramda';
import glob from 'glob';
import path from 'path';
import BitJson from 'bit-scope-client/bit-json';
import { INLINE_COMPONENTS_DIRNAME } from '../constants';
import InlineComponent from './inline-component';

export default class InlineComponentsMap {
  targetDir: string;
  projectBitJson: BitJson;
  _map: { string?: ?InlineComponent };

  constructor(targetDir: string, projectBitJson: BitJson) {
    this.targetDir = targetDir;
    this.projectBitJson = projectBitJson;
    this._map = {};
  }

  addComponent(id: string, bitJson: BitJson) {
    this._map[id] = InlineComponent.create({
      loc: id,
      file: bitJson.getRequiredFile(),
      compiler: bitJson.compiler,
      dependencies: bitJson.getDependenciesArray(),
    });
  }

  build(): Promise<InlineComponentsMap> {
    return new Promise((resolve, reject) => {
      glob('*/*', { cwd: this.targetDir }, (err, files) => {
        if (err) return reject(err);
        files.forEach((loc) => {
          const componentPath = path.join(this.targetDir, loc);
          let bitJson;
          try {
            bitJson = BitJson.loadIfExists(componentPath);
          } catch (e) {
            bitJson = BitJson.load(componentPath, this.projectBitJson);
            bitJson.dependencies = [];
          }
          this.addComponent(loc, bitJson);
        });

        return resolve(this);
      });
    });
  }

  getComponent(id: string) {
    if (!Object.hasOwnProperty.call(this._map, id)) return null;
    return this._map[id];
  }

  map(func: Function): any[] {
    return Object.keys(this._map).map((key: string, index: number) =>
      func(this._map[key], key, index),
    );
  }

  forEach(func: Function): void {
    return Object.keys(this._map).forEach((key: string, index: number) =>
      func(this._map[key], key, index),
    );
  }

  isEmpty() {
    return !this._map || R.isEmpty(this._map);
  }

  static async create(projectRoot, projectBitJson): Promise<InlineComponentsMap> {
    const inlineComponentsDir = path.join(projectRoot, INLINE_COMPONENTS_DIRNAME);
    const map = new InlineComponentsMap(inlineComponentsDir, projectBitJson);
    return map.build();
  }
}
