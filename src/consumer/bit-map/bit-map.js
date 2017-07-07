import path from 'path';
import fs from 'fs-extra';
import R from 'ramda';
import logger from '../../logger/logger';
import { BIT_MAP, DEFAULT_INDEX_NAME, BIT_JSON } from '../../constants';
import InvalidBitMap from './exceptions/invalid-bit-map';
import { BitId } from '../../bit-id';
import { readFile, outputFile } from '../../utils';
import { COMPONENT_ORIGINS, DEPENDENCIES_DIR } from '../../constants';

export type ComponentOrigin = $Keys<typeof COMPONENT_ORIGINS>;

export type ComponentMap = {
  files: Object,
  mainFile: string,
  testsFiles: string[],
  origin: ComponentOrigin
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
      logger.info('bit.map: unable to find an existing bit.map file. Will probably create a new one if needed');
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

  _validateAndFixPaths(componentPaths: Object<string>, isDependency: boolean): void {
    const ignoreFileList = [BIT_JSON];
    const ignoreDirectoriesList = ['node_modules']; // todo: add "dist"?
    if (!isDependency) ignoreDirectoriesList.push(DEPENDENCIES_DIR);

    Object.keys(componentPaths).forEach(component => {
      const componentPath = componentPaths[component];
      const fileName = path.basename(componentPath);
      const baseDirs = path.parse(componentPath).dir.split(path.sep);
      if (ignoreFileList.includes(fileName) || baseDirs.some(dir => ignoreDirectoriesList.includes(dir))) {
        logger.debug(`bit-map, ignoring file ${componentPath}`);
        delete componentPaths[component];
      } else {
        componentPaths[component] = this._makePathRelativeToProjectRoot(componentPath);
      }
    });
  }

  addComponent(componentId: BitId,
               componentPaths: Object<string>,
               mainFile?: string,
               testsFiles?: string[],
               origin: ComponentOrigin,
               isDependency: boolean): void {
    const componentIdStr = isDependency ? componentId.toString() : componentId.changeScope(null).toString();
    logger.debug(`adding to bit.map ${componentIdStr}`);
    this._validateAndFixPaths(componentPaths, isDependency);
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
      this.components[componentIdStr].origin = origin;
      this.components[componentIdStr].mainFile = mainFile ? path.basename(mainFile) : DEFAULT_INDEX_NAME;
      this.components[componentIdStr].testsFiles = testsFiles && testsFiles.length ? testsFiles : [];
    }
  }

  getComponent(id: string): ComponentMap {
    return this.components[id];
  }

  /**
   *
   * Return the full component object means:
   * {
   *    componentId: component
   * }
   *
   * @param {string} path relative to consumer - as stored in bit.map files object
   * @returns {Object<string, ComponentMap>}
   * @memberof BitMap
   */
  getComponentObjectByPath(path: string): Object<string, ComponentMap> {
    return R.pickBy(R.compose(
                      R.contains(path),
                      R.values(),
                      R.prop('files')),
                    this.components);
  }

  /**
   * Return a component id as listed in bit.map file
   * by a path exist in the files object
   *
   * @param {string} path relative to consumer - as stored in bit.map files object
   * @returns {string} component id
   * @memberof BitMap
   */
  getComponentIdByPath(path: string): string {
    const componentObject = this.getComponentObjectByPath(path);
    return R.keys(componentObject)[0];
  }

  // todo: use this lib: https://github.com/getify/JSON.minify to add comments to this file
  // then, upon creating the file for the first time, add a comment with warnings about modifying
  // the file
  write(): Promise<> {
    logger.debug('writing to bit.map');
    return outputFile(this.mapPath, JSON.stringify(this.components, null, 4));
  }
}
