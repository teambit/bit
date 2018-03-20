// @flow
import path from 'path';
import fs from 'fs-extra';
import R from 'ramda';
import json from 'comment-json';
import logger from '../../logger/logger';
import {
  BIT_MAP,
  OLD_BIT_MAP,
  DEFAULT_INDEX_NAME,
  COMPONENT_ORIGINS,
  DEFAULT_SEPARATOR,
  DEFAULT_INDEX_EXTS,
  BIT_VERSION
} from '../../constants';
import { InvalidBitMap, MissingMainFile, MissingBitMapComponent } from './exceptions';
import { BitId, BitIds } from '../../bit-id';
import { outputFile, pathNormalizeToLinux, pathJoinLinux, isDir, pathIsInside } from '../../utils';
import ComponentMap from './component-map';
import type { ComponentMapFile, ComponentOrigin, PathChange } from './component-map';
import type { PathLinux, PathOsBased } from '../../utils/path';
import type { BitIdStr } from '../../bit-id/bit-id';

export type BitMapComponents = { [componentId: string]: ComponentMap };

export type PathChangeResult = { id: string, changes: PathChange[] };

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

  setComponent(id: string, componentMap: ComponentMap) {
    const bitId = BitId.parse(id);
    if (bitId.hasVersion() && !bitId.scope) {
      throw new Error(`invalid bitmap id ${id}, a component must have a scope name when a version is included`);
    }
    this.components[id] = componentMap;
  }

  static ensure(dirPath: string): Promise<BitMap> {
    return Promise.resolve(this.load(dirPath));
  }

  static load(dirPath: PathOsBased): BitMap {
    // support old bitmaps
    const mapPath =
      fs.existsSync(path.join(dirPath, OLD_BIT_MAP)) && !fs.existsSync(path.join(dirPath, BIT_MAP))
        ? path.join(dirPath, OLD_BIT_MAP)
        : path.join(dirPath, BIT_MAP);
    const components = {};
    let version;
    if (fs.existsSync(mapPath)) {
      try {
        const mapFileContent = fs.readFileSync(mapPath);
        const componentsJson = json.parse(mapFileContent.toString('utf8'), null, true);
        version = componentsJson.version;
        // Don't treat version like component
        delete componentsJson.version;
        Object.keys(componentsJson).forEach((componentId) => {
          components[componentId] = ComponentMap.fromJson(componentsJson[componentId]);
        });

        return new BitMap(dirPath, mapPath, components, version);
      } catch (e) {
        throw new InvalidBitMap(mapPath);
      }
    }
    logger.info(`bit.map: unable to find an existing ${BIT_MAP} file. Will probably create a new one if needed`);
    return new BitMap(dirPath, mapPath, components, version || BIT_VERSION);
  }

  getAllComponents(origin?: ComponentOrigin | ComponentOrigin[]): BitMapComponents {
    if (!origin) return this.components;
    const isOriginMatch = component => component.origin === origin;
    // $FlowFixMe we know origin is an array in that case
    const isOriginMatchArray = component => origin.includes(component.origin);
    const filter = Array.isArray(origin) ? isOriginMatchArray : isOriginMatch;
    return R.filter(filter, this.components);
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

  _makePathRelativeToProjectRoot(pathToChange: string): PathOsBased {
    const absolutePath = path.resolve(pathToChange);
    return path.relative(this.projectRoot, absolutePath);
  }

  _searchMainFile(baseMainFile: string, files: ComponentMapFile[]): ?PathLinux {
    // search for an exact relative-path
    let mainFileFromFiles = files.find(file => file.relativePath === baseMainFile);
    if (mainFileFromFiles) return baseMainFile;
    // search for a file-name
    const potentialMainFiles = files.filter(file => file.name === baseMainFile);
    if (!potentialMainFiles.length) return null;
    // when there are several files that met the criteria, choose the closer to the root
    const sortByNumOfDirs = (a, b) =>
      a.relativePath.split(DEFAULT_SEPARATOR).length - b.relativePath.split(DEFAULT_SEPARATOR).length;
    potentialMainFiles.sort(sortByNumOfDirs);
    mainFileFromFiles = R.head(potentialMainFiles);
    return mainFileFromFiles.relativePath;
  }

  _getMainFile(mainFile?: PathLinux, componentMap: ComponentMap): PathLinux {
    const files = componentMap.files.filter(file => !file.test);
    // scenario 1) user entered mainFile => search the mainFile in the files array
    if (mainFile) {
      const foundMainFile = this._searchMainFile(mainFile, files);
      if (foundMainFile) return foundMainFile;
      throw new MissingMainFile(mainFile, files.map(file => path.normalize(file.relativePath)));
    }
    // scenario 2) user didn't enter mainFile and the component has only one file => use that file as the main file.
    if (files.length === 1) return files[0].relativePath;
    // scenario 3) user didn't enter mainFile and the component has multiple files => search for default main files (such as index.js)
    let searchResult;
    DEFAULT_INDEX_EXTS.forEach((ext) => {
      // TODO: can be improved - stop loop if finding main file
      if (!searchResult) {
        const mainFileNameToSearch = `${DEFAULT_INDEX_NAME}.${ext}`;
        searchResult = this._searchMainFile(mainFileNameToSearch, files);
      }
    });
    if (searchResult) return searchResult;
    const mainFileString = `${DEFAULT_INDEX_NAME}.[${DEFAULT_INDEX_EXTS.join(', ')}]`;
    throw new MissingMainFile(mainFileString, files.map(file => path.normalize(file.relativePath)));
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
      // $FlowFixMe at this stage we know that dependencies is not null
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
  getExistingComponentId(componentIdStr: BitIdStr): ?BitIdStr {
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

  /**
   * check if both arrays are equal according to their 'relativePath', regardless the order
   */
  _areFilesArraysEqual(filesA: ComponentMapFile[], filesB: ComponentMapFile[]): boolean {
    if (filesA.length !== filesB.length) return false;
    const cmp = (x, y) => x.relativePath === y.relativePath;
    const diff = R.differenceWith(cmp, filesA, filesB);
    if (!diff.length) return true;
    return false;
  }

  addComponent({
    componentId,
    files,
    mainFile,
    origin,
    parent,
    rootDir,
    trackDir,
    override,
    originallySharedDir
  }: {
    componentId: BitId,
    files: ComponentMapFile[],
    mainFile?: PathOsBased,
    origin: ComponentOrigin,
    parent?: BitId,
    rootDir?: string,
    trackDir?: PathOsBased,
    override: boolean,
    originallySharedDir?: PathLinux
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
      } else if (!this._areFilesArraysEqual(this.components[componentIdStr].files, files)) {
        // do not override existing files, only add new files
        this.components[componentIdStr].files = R.unionWith(
          R.eqBy(R.prop('relativePath')),
          this.components[componentIdStr].files,
          files
        );
      }
      if (mainFile) {
        this.components[componentIdStr].mainFile = this._getMainFile(
          pathNormalizeToLinux(mainFile),
          this.components[componentIdStr]
        );
      }
    } else {
      // $FlowFixMe not easy to fix, we can't instantiate ComponentMap with mainFile because we don't have it yet
      this.setComponent(componentIdStr, new ComponentMap({ files, origin }));
      this.components[componentIdStr].mainFile = this._getMainFile(
        pathNormalizeToLinux(mainFile),
        this.components[componentIdStr]
      );
    }
    if (rootDir) {
      const root = this._makePathRelativeToProjectRoot(rootDir);
      this.components[componentIdStr].rootDir = root ? pathNormalizeToLinux(root) : root;
    }
    if (trackDir) {
      this.components[componentIdStr].trackDir = pathNormalizeToLinux(trackDir);
    }
    this.components[componentIdStr].removeTrackDirIfNeeded();
    if (originallySharedDir) {
      this.components[componentIdStr].originallySharedDir = originallySharedDir;
    }
    if (origin === COMPONENT_ORIGINS.IMPORTED || origin === COMPONENT_ORIGINS.AUTHORED) {
      // if there are older versions, the user is updating an existing component, delete old ones from bit.map
      this.deleteOlderVersionsOfComponent(componentId);
    }

    this.components[componentIdStr].validate();
    this._invalidateCache();
    return this.components[componentIdStr];
  }

  _invalidateCache = () => {
    this.paths = {};
  };

  _removeFromComponentsArray(componentId: BitIdStr) {
    delete this.components[componentId];
    this._invalidateCache();
  }

  removeComponent(id: string | BitId) {
    const bitId = id instanceof BitId ? id : BitId.parse(id);
    const bitmapComponent = this.getExistingComponentId(bitId.toStringWithoutScopeAndVersion());
    if (bitmapComponent) this._removeFromComponentsArray(bitmapComponent);
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
   * needed after exporting or tagging a component.
   * We don't support export/tag of nested components, only authored or imported. For authored/imported components, could be
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

    // update the dependencies array if needed
    Object.keys(this.components).forEach((componentId) => {
      const component = this.components[componentId];
      if (component.dependencies && component.dependencies.includes(olderComponentId)) {
        component.dependencies = component.dependencies.filter(dependency => dependency !== olderComponentId);
        component.dependencies.push(newIdString);
      }
    });
    this._removeFromComponentsArray(olderComponentId);
  }

  /**
   * Get component from bitmap by id if exists
   *
   * @param {string | BitId} id - component id
   * @param {Boolean} shouldThrow - should throw error in case of missing
   * @param {Boolean} includeSearchByBoxAndNameOnly - should compare with box and name of component (without scope or verison)
   * @returns {ComponentMap} componentMap
   */
  getComponent(
    id: string | BitId,
    shouldThrow: boolean = false,
    includeSearchByBoxAndNameOnly: boolean = false,
    ignoreVersion: boolean = false
  ): ComponentMap {
    const bitId: BitId = R.is(String, id) ? BitId.parse(id) : id;
    if (!ignoreVersion && bitId.hasVersion()) {
      if (!this.components[bitId] && shouldThrow) throw new MissingBitMapComponent(bitId);
      return this.components[bitId];
    }
    const idWithVersion = Object.keys(this.components).find(
      componentId =>
        BitId.parse(componentId).toStringWithoutVersion() === bitId.toStringWithoutVersion() ||
        (includeSearchByBoxAndNameOnly &&
          BitId.parse(componentId).toStringWithoutScopeAndVersion() === bitId.toStringWithoutScopeAndVersion())
    );
    if (!idWithVersion && shouldThrow) throw new MissingBitMapComponent(bitId);
    // $FlowFixMe
    return this.components[idWithVersion];
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

  updatePathLocation(from: PathOsBased, to: PathOsBased, fromExists: boolean): PathChangeResult[] {
    const existingPath = fromExists ? from : to;
    const isPathDir = isDir(existingPath);
    const allChanges = [];
    Object.keys(this.components).forEach((componentId) => {
      const componentMap: ComponentMap = this.components[componentId];
      const changes = isPathDir ? componentMap.updateDirLocation(from, to) : componentMap.updateFileLocation(from, to);
      if (changes && changes.length) allChanges.push({ id: componentId, changes });
    });
    if (R.isEmpty(allChanges)) {
      const errorMsg = isPathDir
        ? `neither one of the files use the directory ${from}`
        : `the file ${existingPath} is untracked`;
      throw new Error(errorMsg);
    }

    return allChanges;
  }

  write(): Promise<any> {
    logger.debug('writing to bit.map');
    this.modifyComponentsToLinuxPath(this.components);
    const bitMapContent = Object.assign({}, this.components, { version: this.version });
    return outputFile({ filePath: this.mapPath, content: JSON.stringify(bitMapContent, null, 4) });
  }
}
