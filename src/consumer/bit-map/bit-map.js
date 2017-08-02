import path from 'path';
import fs from 'fs-extra';
import R from 'ramda';
import find from 'lodash.find';
import pickBy from 'lodash.pickby';
import logger from '../../logger/logger';
import { BIT_MAP, DEFAULT_INDEX_NAME, BIT_JSON, COMPONENT_ORIGINS, DEPENDENCIES_DIR } from '../../constants';
import { InvalidBitMap, MissingMainFile, MissingBitMapComponent } from './exceptions';
import { BitId } from '../../bit-id';
import { readFile, outputFile } from '../../utils';

const SHOULD_THROW = true;

export type ComponentOrigin = $Keys<typeof COMPONENT_ORIGINS>;

export type ComponentMap = {
  files: Object, // the keys are the presentation on the model, the values are the presentation on the file system
  mainFile: string,
  rootDir?: string, // needed to search for the component's bit.json. If it's undefined, the component probably don't have bit.json
  origin: ComponentOrigin,
  dependencies: string[], // needed for the bind process
  mainDistFile?: string, // needed when there is a build process involved
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
      logger.info(`bit.map: unable to find an existing ${BIT_MAP} file. Will probably create a new one if needed`);
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

    Object.keys(componentPaths).forEach((component) => {
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

  _getMainFile(mainFile: string, componentMap: ComponentMap) {
    let baseMainFile = mainFile || DEFAULT_INDEX_NAME;
    const files = componentMap.files;
    // Take the file path as main in case there is only one file
    if (!mainFile && files.length === 1) return files[0].relativePath;

    // Search the relativePath of the main file
    let mainFileFromFiles = R.find(R.propEq('relativePath', baseMainFile))(files);

    // Search the base name of the main file and transfer to relativePath
    if (!mainFileFromFiles){
      mainFileFromFiles = R.find(R.propEq('name', baseMainFile))(files);
      baseMainFile = mainFileFromFiles ? mainFileFromFiles.relativePath : baseMainFile;
    }

    // When there is more then one file and the main file not found there
    if (!mainFileFromFiles) throw new MissingMainFile(baseMainFile, files.map((file) => file.relativePath));
    return baseMainFile;
  }

  addDependencyToParent(parent: BitId, dependency: string): void {
    // the parent component might appear in bit.map file with full-id, e.g. when it is a dependency itself.
    // And it might be with the short id, without the scope and the version, e.g. when its origin is AUTHORED or IMPORTED
    const parentWithScope = parent.toString();
    const parentWithoutScope = parent.changeScope(null).toString();
    let parentId;
    if (this.components[parentWithScope]) {
      parentId = parentWithScope;
    } else if (this.components[parentWithoutScope]) {
      parentId = parentWithoutScope;
    } else {
      throw new Error(`Unable to add indirect dependency ${dependency}, as its parent ${parent} does not exist`);
    }
    if (!this.components[parentId].dependencies) {
      this.components[parentId].dependencies = [dependency];
    }
    if (!this.components[parentId].dependencies.includes(dependency)) {
      this.components[parentId].dependencies.push(dependency);
    }
  }

  addComponent({ componentId, files, mainFile, origin, parent, rootDir }: {
    componentId: BitId,
    files: Object[],
    mainFile?: string,
    origin?: ComponentOrigin,
    parent?: BitId,
    rootDir?: string
  }): void {
    const isDependency = origin && origin === COMPONENT_ORIGINS.NESTED;
    const componentIdStr = (origin === COMPONENT_ORIGINS.AUTHORED) ?
      componentId.changeScope(null).toString() : componentId.toString();
    logger.debug(`adding to bit.map ${componentIdStr}`);
    if (isDependency) {
      if (!parent) throw new Error(`Unable to add indirect dependency ${componentId}, without "parent" parameter`);
      this.addDependencyToParent(parent, componentIdStr);
    }
    // TODO: Check if we really need this, or should be moved to add?
    // this._validateAndFixPaths(componentPaths, isDependency);

    if (this.components[componentIdStr]) {
      logger.info(`bit.map: updating an exiting component ${componentIdStr}`);

      // TODO: merge with previous
      this.components[componentIdStr].files = files;

      if (mainFile) {
        this.components[componentIdStr].mainFile = this._getMainFile(mainFile, this.components[componentIdStr]);
      }
    } else {
      this.components[componentIdStr] = { files };
      this.components[componentIdStr].origin = origin;

      this.components[componentIdStr].mainFile = this._getMainFile(mainFile, this.components[componentIdStr]);
    }
    if (rootDir) {
      this.components[componentIdStr].rootDir = this._makePathRelativeToProjectRoot(rootDir);
    }
  }

  addMainDistFileToComponent(id, distFilesPaths: string[]): void {
    if (!this.components[id]) {
      logger.warning(`unable to find the component ${id} in bit.map file`);
      return;
    }

    const mainDistFile = distFilesPaths.find(distFile => distFile.endsWith(this.components[id].mainFile));
    if (!mainDistFile) {
      logger.warning(`unable to find the main dist file of component ${id}. Dist files: ${distFilesPaths.join(', ')}`);
      return;
    }
    this.components[id].mainDistFile = this._makePathRelativeToProjectRoot(mainDistFile);
  }

  /**
   * needed after exporting a local component
   */
  updateComponentScopeName(id: BitId): void {
    const oldIdString = id.toString(true, true);
    const newIdString = id.toString();
    logger.debug(`bit-map: updating a component name from ${oldIdString} to ${newIdString}`);
    if (!this.components[oldIdString]) return; // ignore, maybe it has been updated already
    if (this.components[newIdString]) {
      throw new Error(`There is a local component ${oldIdString} with the same namespace and name as a remote component ${newIdString}`);
    }
    this.components[newIdString] = R.clone(this.components[oldIdString]);
    delete this.components[oldIdString];
  }

  getComponent(id: string|BitId, shouldThrow: boolean): ComponentMap {
    if (R.is(String, id)) {
      id = BitId.parse(id);
    }
    if (id.hasVersion()) {
      if (!this.components[id] && shouldThrow) throw new MissingBitMapComponent(id);
      return this.components[id];
    }
    const idWithVersion = Object.keys(this.components)
      .find(componentId => BitId.parse(componentId).toString(false, true) === id.toString(false, true));
    if (!idWithVersion && shouldThrow) throw new MissingBitMapComponent(id);
    return this.components[idWithVersion];
  }

  getMainFileOfComponent(id: string) {
    const component = this.getComponent(id, SHOULD_THROW);
    return component.mainFile;
  }

  getRootDirOfComponent(id: string){
    const component = this.getComponent(id, SHOULD_THROW);
    return component.rootDir;
  }

  getEntryFileOfComponent(id: string){
    const component = this.getComponent(id, SHOULD_THROW);
    const rootDir = component.rootDir;
    const entryPath = path.join(rootDir, DEFAULT_INDEX_NAME);
    return entryPath;
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
    return pickBy(this.components, (componentObject, componentId) => find(componentObject.files, (file) => file.relativePath === path));
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
