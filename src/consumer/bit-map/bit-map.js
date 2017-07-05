import path from 'path';
import fs from 'fs-extra';
import R from 'ramda';
import logger from '../../logger/logger';
import { BIT_MAP, DEFAULT_INDEX_NAME, BIT_JSON } from '../../constants';
import InvalidBitMap from './exceptions/invalid-bit-map';
import { BitId } from '../../bit-id';
import { readFile, outputFile } from '../../utils';

export type ComponentMap = {
  files: Object,
  mainFile: string,
  testsFiles: string[]
}

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
        const mapFileContent = await readFile(mapPath);
        components = JSON.parse(mapFileContent.toString('utf8'));
      } catch (e) {
        throw new InvalidBitMap(mapPath);
      }
    } else {
      logger.info('bit.map: unable to find an existing bit.map file');
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

  _makePathRelativeToProjectRoot(pathToChange: string): string {
    if (!path.isAbsolute(pathToChange)) return pathToChange;
    return pathToChange.replace(`${this.projectRoot}${path.sep}`, '');
  }

  _validateAndFixPaths(componentPaths: Object<string>): void {
    const ignoreFileList = [BIT_JSON];
    const ignoreDirectoriesList = ['dependencies', 'node_modules']; // todo: add "dist"?

    Object.keys(componentPaths).forEach(component => {
      const componentPath = componentPaths[component];
      const fileName = path.basename(componentPath);
      const baseDirs = path.parse(componentPath).dir.split(path.sep);
      if (ignoreFileList.includes(fileName) || baseDirs.some(dir => ignoreDirectoriesList.includes(dir))) {
        delete componentPaths[component];
      } else {
        componentPaths[component] = this._makePathRelativeToProjectRoot(componentPath);
      }
    });
  }

  addComponent(componentId: BitId,
               componentPaths: Object<string>,
               mainFile?: string,
               testsFiles?: string[]): void {
    const componentIdStr = componentId.changeScope(null).toString();
    logger.debug(`adding to bit.map ${componentIdStr}`);
    this._validateAndFixPaths(componentPaths);
    if (this.components[componentIdStr]) {
      logger.info(`bit.map: updating an exiting component ${componentIdStr}`);
      if (componentPaths) {
        const allPaths = R.merge(this.components[componentIdStr].files, componentPaths);
        this.components[componentIdStr].files = allPaths;
      }
      if (mainFile) this.components[componentIdStr].mainFile = mainFile;
      if (testsFiles && testsFiles.length) {
        const allTestsFiles = testsFiles.concat(this.components[componentIdStr].testsFiles);
        this.components[componentIdStr].testsFiles = R.uniq(allTestsFiles);
      }
    } else {
      this.components[componentIdStr] = { files: componentPaths };
      this.components[componentIdStr].origin = componentId.scope;
      this.components[componentIdStr].mainFile = mainFile || DEFAULT_INDEX_NAME;
      this.components[componentIdStr].testsFiles = testsFiles && testsFiles.length ? testsFiles : [];
    }
  }

  getComponent(id: string): ComponentMap {
    return this.components[id];
  }

  // todo: use this lib: https://github.com/getify/JSON.minify to add comments to this file
  // then, upon creating the file for the first time, add a comment with warnings about modifying
  // the file
  write(): Promise<> {
    logger.debug('writing to bit.map');
    return outputFile(this.mapPath, JSON.stringify(this.components, null, 4));
  }
}
