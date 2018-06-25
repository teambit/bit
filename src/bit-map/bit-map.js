/** @flow */
import path from 'path';
import fs from 'fs-extra';
import { BIT_MAP, COMPONENT_ORIGINS } from '../constants';
import InvalidBitMap from './exceptions/invalid-bit-map';
import { readFileP } from '../utils';

export type ComponentOrigin = $Keys<typeof COMPONENT_ORIGINS>;

export type ComponentMap = {
  files: Object,
  mainFile: string,
  testsFiles: string[],
  rootDir?: string,
  origin: ComponentOrigin,
  dependencies: string[],
  mainDistFile?: string
};

export default class BitMap {
  projectRoot: string;
  mapPath: string;
  components: Object<ComponentMap>;
  constructor(projectRoot: string, mapPath: string, components: Object<string>) {
    this.projectRoot = projectRoot;
    this.mapPath = mapPath;
    this.components = components;
  }

  static async load(dirPath: string): BitMap {
    const mapPath = path.join(dirPath, BIT_MAP);
    let components;
    if (fs.existsSync(mapPath)) {
      try {
        const mapFileContent = await readFileP(mapPath);
        components = JSON.parse(mapFileContent.toString('utf8'));
      } catch (e) {
        throw new InvalidBitMap(mapPath);
      }
    } else {
      components = {};
    }
    return new BitMap(dirPath, mapPath, components);
  }

  isComponentExist(componentId: string): boolean {
    return !!this.components[componentId];
  }

  getAllComponents(): Object<string> {
    return this.components;
  }

  getComponent(id: string): ComponentMap {
    return this.components[id];
  }
}
