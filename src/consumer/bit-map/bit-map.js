import path from 'path';
import fs from 'fs-extra';
import R from 'ramda';
import find from 'lodash.find';
import pickBy from 'lodash.pickby';
import logger from '../../logger/logger';
import { BIT_MAP, DEFAULT_INDEX_NAME, DEFAULT_INDEX_TS_NAME, BIT_JSON, COMPONENT_ORIGINS, DEPENDENCIES_DIR } from '../../constants';
import { InvalidBitMap, MissingMainFile, MissingBitMapComponent } from './exceptions';
import { BitId } from '../../bit-id';
import { readFile, outputFile } from '../../utils';

const SHOULD_THROW = true;

export type ComponentOrigin = $Keys<typeof COMPONENT_ORIGINS>;

export type ComponentMapFile = {
  name: string,
  relativePath: string,
  test: string
}

export type ComponentMap = {
  files: ComponentMapFile[],
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
    this.hasChanged = false;
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

  getAllComponents(origin?: ComponentOrigin): Object<string> {
    if (!origin) return this.components;
    const isOriginMatch = component => component.origin === origin;
    return R.filter(isOriginMatch, this.components);
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

  // todo - need to move to bit-javascript
  _searchMainFile(baseMainFile: string, files: ComponentMapFile[], originalMainFile: string) {
    let newBaseMainFile;
    // Search the relativePath of the main file
    let mainFileFromFiles = R.find(R.propEq('relativePath', baseMainFile))(files);
    // Search the base name of the main file and transfer to relativePath
    if (R.isNil(mainFileFromFiles)) {
      const potentialMainFiles = files.filter(file => file.name === baseMainFile);
      if (potentialMainFiles.length) {
        // when there are several files that met the criteria, choose the closer to the root
        const sortByNumOfDirs = (a, b) => a.relativePath.split(path.sep).length - b.relativePath.split(path.sep).length;
        potentialMainFiles.sort(sortByNumOfDirs);
        mainFileFromFiles = R.head(potentialMainFiles);
      }
      newBaseMainFile = mainFileFromFiles ? mainFileFromFiles.relativePath : baseMainFile;
      return { mainFileFromFiles, baseMainFile: newBaseMainFile || baseMainFile };
    }
    return { mainFileFromFiles, baseMainFile: originalMainFile };
  }
  _getMainFile(mainFile: string, componentMap: ComponentMap) {
    const files = componentMap.files.filter(file => !file.test);
    // Take the file path as main in case there is only one file
    if (!mainFile && files.length === 1) return files[0].relativePath;
    // search main file (index.js or index.ts in case no ain file was entered - move to bit-javascript
    let searchResult = this._searchMainFile(mainFile, files, mainFile);
    if (!searchResult.mainFileFromFiles) searchResult = this._searchMainFile(DEFAULT_INDEX_NAME, files, mainFile);
    if (!searchResult.mainFileFromFiles) searchResult = this._searchMainFile(DEFAULT_INDEX_TS_NAME, files, mainFile);


    // When there is more then one file and the main file not found there
    if (R.isNil(searchResult.mainFileFromFiles)) {
      const mainFileString = mainFile || (DEFAULT_INDEX_NAME + ' or '+ DEFAULT_INDEX_TS_NAME);
      throw new MissingMainFile(mainFileString, files.map((file) => file.relativePath));
    }
    return searchResult.baseMainFile;
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

  deleteOlderVersionsOfComponent(componentId: BitId): void {
    const allVersions = Object.keys(this.components)
      .filter(id => BitId.parse(id).toStringWithoutVersion() === componentId.toStringWithoutVersion());
    allVersions.forEach((version) => {
      if (version !== componentId.toString() && version.origin !== COMPONENT_ORIGINS.NESTED) {
        logger.debug(`BitMap: deleting an older version ${version} of an existing component ${componentId.toString()}`);
        delete this.components[version];
      }
    });
  }

  _changeFilesPathAccordingToItsRootDir(existingRootDir, files) {
    files.forEach((file) => {
      const newRelativePath = path.relative(existingRootDir, file.relativePath);
      if (newRelativePath.startsWith('..')) {
        // this is forbidden for security reasons. Allowing files to be written outside the components directory may
        // result in overriding OS files.
        throw new Error(`unable to add file ${file.relativePath} because it's located outside the component root dir ${existingRootDir}`);
      }
      file.relativePath = newRelativePath;
    });
  }

  /**
   * When the given id doesn't include scope-name, there might be a similar component in bit.map with scope-name, use it
   * only when the origin is imported or author, as we don't allow to update nested component.
   */
  getExistingComponentId(componentIdStr: string): string|boolean {
    if (this.components[componentIdStr]) return componentIdStr;
    if (BitId.parse(componentIdStr).scope) return false; // given id has scope, it should have been an exact match
    const foundId = Object.keys(this.components).find((component) => {
      return BitId.parse(component).toStringWithoutScopeAndVersion() === componentIdStr;
    });
    if (!foundId) return false;
    if (this.components[foundId].origin === COMPONENT_ORIGINS.NESTED) {
      throw new Error(`One of your dependencies (${foundId}) has already the same namespace and name. 
      If you're trying to add a new component, please choose a new namespace or name.
      If you're trying to update a dependency component, please re-import it individually`);
    }
    return foundId;
  }

  addComponent({ componentId, files, mainFile, origin, parent, rootDir, override }: {
    componentId: BitId,
    files: ComponentMapFile[],
    mainFile?: string,
    origin?: ComponentOrigin,
    parent?: BitId,
    rootDir?: string,
    override: boolean
  }): void {
    const isDependency = origin && origin === COMPONENT_ORIGINS.NESTED;
    const componentIdStr = componentId.toString();
    logger.debug(`adding to bit.map ${componentIdStr}`);
    if (isDependency) {
      if (!parent) throw new Error(`Unable to add indirect dependency ${componentId}, without "parent" parameter`);
      this.addDependencyToParent(parent, componentIdStr);
    }
    // TODO: Check if we really need this, or should be moved to add?
    // this._validateAndFixPaths(componentPaths, isDependency);

    if (this.components[componentIdStr]) {
      logger.info(`bit.map: updating an exiting component ${componentIdStr}`);
      const existingRootDir = this.components[componentIdStr].rootDir;
      if (existingRootDir) this._changeFilesPathAccordingToItsRootDir(existingRootDir, files);
      if (override) {
        this.components[componentIdStr].files = files;
      } else {
        this.components[componentIdStr].files = R.unionWith(R.eqBy(R.prop('relativePath')), files, this.components[componentIdStr].files);
      }
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
    if (origin === COMPONENT_ORIGINS.IMPORTED) {
      // if there are older versions, the user is updating an existing component, delete old ones from bit.map
      this.deleteOlderVersionsOfComponent(componentId);
    }
  }

  removeComponent(id: string) {
    delete this.components[id];
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
   * needed after exporting a component.
   * We don't support export of nested components, only authored or imported. For authored/imported components, could be
   * in the file-system only one instance with the same box-name and component-name. As a result, we can strip the
   * scope-name and the version, find the older version in bit.map and update the id with the new one.
   */
  updateComponentId(id: BitId): void {
    const newIdString = id.toString();
    const olderComponentsIds = Object.keys(this.components).filter(componentId => BitId
      .parse(componentId).toStringWithoutScopeAndVersion() === id.toStringWithoutScopeAndVersion()
    && componentId !== newIdString
    && this.components[componentId].origin !== COMPONENT_ORIGINS.NESTED);

    if (!olderComponentsIds.length) {
      logger.debug(`bit-map: no need to update ${newIdString}`);
      return;
    }
    if (olderComponentsIds.length > 1) {
      throw new Error(`Your ${BIT_MAP} file has more than one version of ${id.toStringWithoutScopeAndVersion()} and they 
      are authored or imported. This scenario is not supported`);
    }
    const olderComponentId = R.head(olderComponentsIds);
    logger.debug(`BitMap: updating an older component ${olderComponentId} with a newer component ${newIdString}`);
    this.components[newIdString] = R.clone(this.components[olderComponentId]);
    delete this.components[olderComponentId];
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
      .find(componentId => BitId.parse(componentId).toStringWithoutVersion() === id.toStringWithoutVersion());
    if (!idWithVersion && shouldThrow) throw new MissingBitMapComponent(id);
    return this.components[idWithVersion];
  }

  getMainFileOfComponent(id: string) {
    const component = this.getComponent(id, SHOULD_THROW);
    return component.mainFile;
  }

  getRootDirOfComponent(id: string) {
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
   * @param {string} filePath relative to root dir - as stored in bit.map files object
   * @returns {Object<string, ComponentMap>}
   * @memberof BitMap
   */
  getComponentObjectByPath(filePath: string): Object<string, ComponentMap> {
    return pickBy(this.components, (componentObject, componentId) => {
      const rootDir = componentObject.rootDir;
      return find(componentObject.files, (file) => {
        return (file.relativePath === filePath || (rootDir && path.join(rootDir, file.relativePath) === filePath));
      });
    });
  }

  /**
   *
   * Return the full component object by a root path for the component, means:
   * {
   *    componentId: component
   * }
   *
   * @param {string} rootPath relative to consumer - as stored in bit.map files object
   * @returns {Object<string, ComponentMap>}
   * @memberof BitMap
   */
  getComponentObjectByRootPath(rootPath: string): Object<string, ComponentMap> {
    return pickBy(this.components, componentObject => componentObject.rootDir === rootPath);
  }

  /**
   * Return a component id as listed in bit.map file
   * by a root path of the component
   *
   * @param {string} rootPath relative to consumer - as stored in bit.map files object
   * @returns {string} component id
   * @memberof BitMap
   */
  getComponentIdByRootPath(rootPath: string): string {
    const componentObject = this.getComponentObjectByRootPath(rootPath);
    return R.keys(componentObject)[0];
  }

  /**
   * Return a component id as listed in bit.map file
   * by a path exist in the files object
   *
   * @param {string} componentPath relative to consumer - as stored in bit.map files object
   * @returns {string} component id
   * @memberof BitMap
   */
  getComponentIdByPath(componentPath: string): string {
    const componentObject = this.getComponentObjectByPath(componentPath);
    return R.keys(componentObject)[0];
  }

  write(): Promise<> {
    logger.debug('writing to bit.map');
    return outputFile(this.mapPath, JSON.stringify(this.components, null, 4));
  }
}
