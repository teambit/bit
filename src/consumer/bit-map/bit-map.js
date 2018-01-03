// @flow
import path from 'path';
import fs from 'fs-extra';
import R from 'ramda';
import find from 'lodash.find';
import pickBy from 'lodash.pickby';
import json from 'comment-json';
import logger from '../../logger/logger';
import { BIT_MAP, DEFAULT_INDEX_NAME, COMPONENT_ORIGINS, DEFAULT_SEPARATOR, DEFAULT_INDEX_EXTS } from '../../constants';
import { InvalidBitMap, MissingMainFile, MissingBitMapComponent } from './exceptions';
import { BitId, BitIds } from '../../bit-id';
import { readFile, outputFile, pathNormalizeToLinux, pathJoinLinux, isDir, pathIsInside } from '../../utils';
import ComponentMap from './component-map';
import type { ComponentMapFile, ComponentOrigin } from './component-map';

const SHOULD_THROW = true;

export type BitMapComponents = { [componentId: string]: ComponentMap };

export default class BitMap {
  projectRoot: string;
  mapPath: string;
  components: BitMapComponents;
  hasChanged: boolean;
  version: string;
  paths: { [path: string]: string }; // path => componentId

  constructor(projectRoot: string, mapPath: string, components: BitMapComponents, version: string) {
    this.projectRoot = projectRoot;
    this.mapPath = mapPath;
    this.components = components;
    this.hasChanged = false;
    this.version = version;
    this.paths = {};
  }

  static async load(dirPath: string): Promise<BitMap> {
    const mapPath = path.join(dirPath, BIT_MAP);
    const components = {};
    let version;
    if (fs.existsSync(mapPath)) {
      try {
        const mapFileContent = await readFile(mapPath);
        const componentsJson = json.parse(mapFileContent.toString('utf8'), null, true);
        version = componentsJson.version;
        // Don't treat version like component
        delete componentsJson.version;
        Object.keys(componentsJson).forEach((componentId) => {
          components[componentId] = ComponentMap.fromJson(componentsJson[componentId]);
        });
      } catch (e) {
        throw new InvalidBitMap(mapPath);
      }
    } else {
      logger.info(`bit.map: unable to find an existing ${BIT_MAP} file. Will probably create a new one if needed`);
    }

    return new BitMap(dirPath, mapPath, components, version);
  }

  getAllComponents(origin?: ComponentOrigin): BitMapComponents {
    if (!origin) return this.components;
    const isOriginMatch = component => component.origin === origin;
    return R.filter(isOriginMatch, this.components);
  }

  getAuthoredExportedComponents(): BitId[] {
    const componentsIds = [];
    Object.keys(this.components).forEach((componentId) => {
      if (this.components[componentId].origin === COMPONENT_ORIGINS.AUTHORED) {
        const idParsed = BitId.parse(componentId);
        if (idParsed.scope) componentsIds.push(idParsed);
      }
    });
    return componentsIds;
  }

  _makePathRelativeToProjectRoot(pathToChange: string): string {
    const absolutePath = path.resolve(pathToChange);
    return path.relative(this.projectRoot, absolutePath);
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
        const sortByNumOfDirs = (a, b) =>
          a.relativePath.split(DEFAULT_SEPARATOR).length - b.relativePath.split(DEFAULT_SEPARATOR).length;
        potentialMainFiles.sort(sortByNumOfDirs);
        mainFileFromFiles = R.head(potentialMainFiles);
      }
      newBaseMainFile = mainFileFromFiles ? mainFileFromFiles.relativePath : baseMainFile;
      return { mainFileFromFiles, baseMainFile: newBaseMainFile || baseMainFile };
    }
    return { mainFileFromFiles, baseMainFile: originalMainFile };
  }

  _getMainFile(mainFile?: string, componentMap: ComponentMap) {
    const files = componentMap.files.filter(file => !file.test);
    // Take the file path as main in case there is only one file
    if (!mainFile && files.length === 1) return files[0].relativePath;
    // search main file (index.js or index.ts) in case no main file was entered - move to bit-javascript
    let searchResult = this._searchMainFile(mainFile, files, mainFile);
    if (!searchResult.mainFileFromFiles) {
      // TODO: can be improved - stop loop if finding main file
      DEFAULT_INDEX_EXTS.forEach((ext) => {
        if (!searchResult.mainFileFromFiles) {
          const mainFileNameToSearch = `${DEFAULT_INDEX_NAME}.${ext}`;
          searchResult = this._searchMainFile(mainFileNameToSearch, files, mainFile);
        }
      });
    }

    // When there is more then one file and the main file not found there
    if (R.isNil(searchResult.mainFileFromFiles)) {
      const mainFileString = mainFile || `${DEFAULT_INDEX_NAME}.[${DEFAULT_INDEX_EXTS.join(', ')}]`;
      throw new MissingMainFile(mainFileString, files.map(file => path.normalize(file.relativePath)));
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
    const allVersions = Object.keys(this.components).filter(
      id => BitId.parse(id).toStringWithoutVersion() === componentId.toStringWithoutVersion()
    );
    allVersions.forEach((version) => {
      if (version !== componentId.toString() && this.components[version].origin !== COMPONENT_ORIGINS.NESTED) {
        logger.debug(`BitMap: deleting an older version ${version} of an existing component ${componentId.toString()}`);
        this._removeFromComponentsArray(version);
      }
    });
  }

  /**
   * When the given id doesn't include scope-name, there might be a similar component in bit.map with scope-name
   */
  getExistingComponentId(componentIdStr: string): ?string {
    if (this.components[componentIdStr]) return componentIdStr;
    const parsedId = BitId.parse(componentIdStr);
    if (parsedId.scope && !parsedId.hasVersion()) {
      return Object.keys(this.components).find((component) => {
        return BitId.parse(component).toStringWithoutVersion() === componentIdStr;
      });
    }
    return Object.keys(this.components).find((component) => {
      return BitId.parse(component).toStringWithoutScopeAndVersion() === componentIdStr;
    });
  }

  addComponent({
    componentId,
    files,
    mainFile,
    origin,
    parent,
    rootDir,
    override,
    originallySharedDir
  }: {
    componentId: BitId,
    files: ComponentMapFile[],
    mainFile?: string,
    origin: ComponentOrigin,
    parent?: BitId,
    rootDir?: string,
    override: boolean,
    originallySharedDir?: string
  }): ComponentMap {
    const isDependency = origin === COMPONENT_ORIGINS.NESTED;
    const componentIdStr = componentId.toString();
    logger.debug(`adding to bit.map ${componentIdStr}`);
    if (isDependency) {
      if (!parent) throw new Error(`Unable to add indirect dependency ${componentIdStr}, without "parent" parameter`);
      this.addDependencyToParent(parent, componentIdStr);
    }
    if (this.components[componentIdStr]) {
      logger.info(`bit.map: updating an exiting component ${componentIdStr}`);
      const existingRootDir = this.components[componentIdStr].rootDir;
      if (existingRootDir) ComponentMap.changeFilesPathAccordingToItsRootDir(existingRootDir, files);
      if (override) {
        this.components[componentIdStr].files = files;
      } else {
        this.components[componentIdStr].files = R.unionWith(
          R.eqBy(R.prop('relativePath')),
          files,
          this.components[componentIdStr].files
        );
      }
      if (mainFile) {
        this.components[componentIdStr].mainFile = this._getMainFile(
          pathNormalizeToLinux(mainFile),
          this.components[componentIdStr]
        );
      }
    } else {
      this.components[componentIdStr] = new ComponentMap({ files, origin });
      this.components[componentIdStr].mainFile = this._getMainFile(
        pathNormalizeToLinux(mainFile),
        this.components[componentIdStr]
      );
    }
    if (rootDir) {
      const root = this._makePathRelativeToProjectRoot(rootDir);
      this.components[componentIdStr].rootDir = root ? pathNormalizeToLinux(root) : root;
    }
    if (originallySharedDir) {
      this.components[componentIdStr].originallySharedDir = originallySharedDir;
    }
    if (origin === COMPONENT_ORIGINS.IMPORTED || origin === COMPONENT_ORIGINS.AUTHORED) {
      // if there are older versions, the user is updating an existing component, delete old ones from bit.map
      this.deleteOlderVersionsOfComponent(componentId);
    }

    return this.components[componentIdStr];
  }

  _removeFromComponentsArray(componentId) {
    const invalidateCache = () => {
      this.paths = {};
    };
    delete this.components[componentId];
    invalidateCache();
  }

  removeComponent(id: string | BitId) {
    const bitId = id instanceof BitId ? id : BitId.parse(id);
    const bitmapComponent = this.getExistingComponentId(bitId.toStringWithoutScopeAndVersion());
    this._removeFromComponentsArray(bitmapComponent);
    return bitmapComponent;
  }
  removeComponents(ids: BitIds) {
    return ids.map(id => this.removeComponent(id));
  }
  addMainDistFileToComponent(id: string, distFilesPaths: string[]): void {
    if (!this.components[id]) {
      logger.warn(`unable to find the component ${id} in bit.map file`);
      return;
    }
    const distFilesPathsNormalized = distFilesPaths.map(filePath => pathNormalizeToLinux(filePath));

    const mainDistFile = distFilesPathsNormalized.find(distFile => distFile.endsWith(this.components[id].mainFile));
    if (!mainDistFile) {
      logger.warn(
        `unable to find the main dist file of component ${id}. Dist files: ${distFilesPathsNormalized.join(', ')}`
      );
      return;
    }
    this.components[id].mainDistFile = this._makePathRelativeToProjectRoot(mainDistFile);
  }

  isExistWithSameVersion(id: BitId) {
    return id.hasVersion() && this.components[id.toString()];
  }

  /**
   * needed after exporting a component.
   * We don't support export of nested components, only authored or imported. For authored/imported components, could be
   * in the file-system only one instance with the same box-name and component-name. As a result, we can strip the
   * scope-name and the version, find the older version in bit.map and update the id with the new one.
   */
  updateComponentId(id: BitId): void {
    const newIdString = id.toString();
    const olderComponentsIds = Object.keys(this.components).filter(
      componentId =>
        BitId.parse(componentId).toStringWithoutScopeAndVersion() === id.toStringWithoutScopeAndVersion() &&
        componentId !== newIdString &&
        this.components[componentId].origin !== COMPONENT_ORIGINS.NESTED
    );

    if (!olderComponentsIds.length) {
      logger.debug(`bit-map: no need to update ${newIdString}`);
      return;
    }
    if (olderComponentsIds.length > 1) {
      throw new Error(`Your ${BIT_MAP} file has more than one version of ${id.toStringWithoutScopeAndVersion()} and they 
      are authored or imported. This scenario is not supported`);
    }
    const olderComponentId = olderComponentsIds[0];
    logger.debug(`BitMap: updating an older component ${olderComponentId} with a newer component ${newIdString}`);
    this.components[newIdString] = this.components[olderComponentId];
    this._removeFromComponentsArray(olderComponentId);
  }

  getComponent(id: string | BitId, shouldThrow: boolean = false): ComponentMap {
    if (R.is(String, id)) {
      id = BitId.parse(id);
    }
    // $FlowFixMe
    if (id.hasVersion()) {
      if (!this.components[id] && shouldThrow) throw new MissingBitMapComponent(id);
      return this.components[id];
    }
    const idWithVersion = Object.keys(this.components).find(
      // $FlowFixMe
      componentId => BitId.parse(componentId).toStringWithoutVersion() === id.toStringWithoutVersion()
    );
    if (!idWithVersion && shouldThrow) throw new MissingBitMapComponent(id);
    // $FlowFixMe
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
  getComponentObjectByPath(filePath: string): BitMapComponents {
    return pickBy(this.components, (componentObject) => {
      const rootDir = componentObject.rootDir;
      const sharedDir = componentObject.originallySharedDir;
      return find(componentObject.files, (file) => {
        const relativePath = sharedDir ? pathJoinLinux(sharedDir, file.relativePath) : file.relativePath;
        return relativePath === filePath || (rootDir && pathJoinLinux(rootDir, relativePath) === filePath);
      });
    });
  }

  /**
   * Return a potential componentMap if file is supposed to be part of it
   * by a path exist in the files object
   *
   * @param {string} componentPath relative to consumer - as stored in bit.map files object
   * @returns {ComponentMap} componentMap
   */
  getComponentObjectOfFileByPath(componentPath: string): BitMapComponents {
    const components = this.getAllComponents();
    return R.pickBy(component => pathIsInside(componentPath, component.rootDir || this.projectRoot), components);
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
  getComponentObjectByRootPath(rootPath: string): BitMapComponents {
    return pickBy(this.components, componentObject => componentObject.rootDir === rootPath);
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
    this._populateAllPaths();
    return this.paths[componentPath];
  }

  _populateAllPaths() {
    if (R.isEmpty(this.paths)) {
      Object.keys(this.components).forEach((componentId) => {
        const component = this.components[componentId];
        component.files.forEach((file) => {
          const relativeToConsumer = component.rootDir
            ? pathJoinLinux(component.rootDir, file.relativePath)
            : file.relativePath;
          this.paths[relativeToConsumer] = componentId;
        });
      });
    }
  }

  modifyComponentsToLinuxPath(components: Object) {
    Object.keys(components).forEach((key) => {
      components[key].files.forEach((file) => {
        file.relativePath = pathNormalizeToLinux(file.relativePath);
      });
      components[key].mainFile = pathNormalizeToLinux(components[key].mainFile);
    });
  }

  updatePathLocation(from: string, to: string, fromExists: boolean): Array<Object> {
    const existingPath = fromExists ? from : to;
    const isPathDir = isDir(existingPath);
    const allChanges = [];
    Object.keys(this.components).forEach((componentId) => {
      const componentMap: ComponentMap = this.components[componentId];
      const changes = isPathDir ? componentMap.updateDirLocation(from, to) : componentMap.updateFileLocation(from, to);
      if (changes) allChanges.push(changes);
    });
    if (R.isEmpty(allChanges)) {
      const errorMsg = isPathDir
        ? `neither one of the files use the directory ${existingPath}`
        : `the file ${existingPath} is untracked`;
      throw new Error(errorMsg);
    }
    const flattenedArray = Array.prototype.concat(...allChanges);
    return flattenedArray.filter(file => fs.pathExistsSync(file.to) || fs.pathExistsSync(file.from));
  }

  write(): Promise<any> {
    logger.debug('writing to bit.map');
    this.modifyComponentsToLinuxPath(this.components);
    const bitMapContent = Object.assign({}, this.components, { version: this.version });
    return outputFile({ filePath: this.mapPath, content: JSON.stringify(bitMapContent, null, 4) });
  }
}
