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
import type { PathLinux, PathOsBased, PathOsBasedRelative, PathOsBasedAbsolute, PathRelative } from '../../utils/path';
import type { BitIdStr } from '../../bit-id/bit-id';
import GeneralError from '../../error/general-error';

export type BitMapComponents = { [componentId: string]: ComponentMap };

export type PathChangeResult = { id: string, changes: PathChange[] };

export default class BitMap {
  projectRoot: string;
  mapPath: string;
  components: BitMapComponents;
  hasChanged: boolean;
  version: string;
  paths: { [path: string]: string }; // path => componentId
  pathsLowerCase: { [path: string]: string }; // path => componentId

  constructor(projectRoot: string, mapPath: string, components: BitMapComponents, version: string) {
    this.projectRoot = projectRoot;
    this.mapPath = mapPath;
    this.components = components;
    this.hasChanged = false;
    this.version = version;
    this.paths = {};
    this.pathsLowerCase = {};
  }

  markAsChanged() {
    this.hasChanged = true;
    this._invalidateCache();
  }

  setComponent(id: string, componentMap: ComponentMap) {
    const bitId = BitId.parse(id);
    if (!bitId.hasVersion() && bitId.scope) {
      throw new GeneralError(`invalid bitmap id ${id}, a component must have a version when a scope-name is included`);
    }
    const idWithoutScopeAndVersion = bitId.toStringWithoutScopeAndVersion();
    if (componentMap.origin !== COMPONENT_ORIGINS.NESTED) {
      // make sure there are no duplications (same namespace+name)
      Object.keys(this.components).forEach((compId) => {
        if (
          BitId.parse(compId).toStringWithoutScopeAndVersion() === idWithoutScopeAndVersion &&
          this.components[compId].origin !== COMPONENT_ORIGINS.NESTED
        ) {
          throw new GeneralError(`your id ${id} is duplicated with ${compId}`);
        }
      });
    }

    this.components[id] = componentMap;
    this.markAsChanged();
  }

  static load(dirPath: PathOsBasedAbsolute): BitMap {
    const standardLocation = path.join(dirPath, BIT_MAP);
    const oldLocation = path.join(dirPath, OLD_BIT_MAP);
    const getBitMapLocation = (): ?PathOsBased => {
      if (fs.existsSync(standardLocation)) return standardLocation;
      if (fs.existsSync(oldLocation)) return oldLocation;
      return null;
    };
    const bitMapLocation = getBitMapLocation();
    const components = {};
    if (!bitMapLocation) {
      logger.info(`bit.map: unable to find an existing ${BIT_MAP} file. Will create a new one if needed`);
      return new BitMap(dirPath, standardLocation, components, BIT_VERSION);
    }
    const mapFileContent = fs.readFileSync(bitMapLocation);
    let componentsJson;
    try {
      componentsJson = json.parse(mapFileContent.toString('utf8'), null, true);
    } catch (e) {
      logger.error(e);
      throw new InvalidBitMap(bitMapLocation, e.message);
    }
    const version = componentsJson.version;
    // Don't treat version like component
    delete componentsJson.version;
    Object.keys(componentsJson).forEach((componentId) => {
      components[componentId] = ComponentMap.fromJson(componentsJson[componentId]);
    });

    return new BitMap(dirPath, bitMapLocation, components, version);
  }

  /**
   * if resetHard, delete the bitMap file.
   * Otherwise, try to load it and only if the file is corrupted then delete it.
   */
  static reset(dirPath: PathOsBasedAbsolute, resetHard: boolean): void {
    const bitMapPath = path.join(dirPath, BIT_MAP);
    const deleteBitMapFile = () => {
      logger.info(`deleting the bitMap file at ${bitMapPath}`);
      fs.removeSync(bitMapPath);
    };
    if (resetHard) {
      deleteBitMapFile();
      return;
    }
    try {
      BitMap.load(dirPath);
    } catch (err) {
      if (err instanceof InvalidBitMap) {
        deleteBitMapFile();
        return;
      }
      throw err;
    }
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

  _makePathRelativeToProjectRoot(pathToChange: PathRelative): PathOsBasedRelative {
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
      throw new GeneralError(`Unable to add indirect dependency ${dependency}, as its parent ${parent} does not exist`);
    }
    if (!this.components[parentId].dependencies) {
      this.components[parentId].dependencies = [dependency];
    }
    if (!this.components[parentId].dependencies.includes(dependency)) {
      // $FlowFixMe at this stage we know that dependencies is not null
      this.components[parentId].dependencies.push(dependency);
    }
    this.markAsChanged();
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
  getExistingComponentId(componentIdStr: BitIdStr, origin?: ComponentOrigin | ComponentOrigin[]): ?BitIdStr {
    const components = this.getAllComponents(origin);
    if (components[componentIdStr]) return componentIdStr;
    const parsedId = BitId.parse(componentIdStr);
    if (parsedId.scope && !parsedId.hasVersion()) {
      return Object.keys(components).find((component) => {
        return BitId.parse(component).toStringWithoutVersion() === componentIdStr;
      });
    }
    return Object.keys(components).find((component) => {
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

  /**
   * add files from filesB that are not in filesA
   */
  mergeFilesArray(filesA: ComponentMapFile[], filesB: ComponentMapFile[]): ComponentMapFile[] {
    return R.unionWith(R.eqBy(R.prop('relativePath')), filesA, filesB);
  }

  /**
   * if an existing file is for example uppercase and the new file is lowercase it has different
   * behavior according to the OS. some OS are case sensitive, some are not.
   * it's safer to avoid saving both files and instead, replacing the old file with the new one.
   * in case a file has replaced and it is also a mainFile, replace the mainFile as well
   */
  _updateFilesWithCurrentLetterCases(componentId: string, newFiles: ComponentMapFile[]) {
    const currentComponentMap = this.components[componentId];
    const currentFiles = currentComponentMap.files;
    currentFiles.forEach((currentFile) => {
      const sameFile = newFiles.find(
        newFile => newFile.relativePath.toLowerCase() === currentFile.relativePath.toLowerCase()
      );
      if (sameFile && currentFile.relativePath !== sameFile.relativePath) {
        if (currentComponentMap.mainFile === currentFile.relativePath) {
          currentComponentMap.mainFile = sameFile.relativePath;
        }
        currentFile.relativePath = sameFile.relativePath;
      }
    });
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
      if (!parent) {
        throw new GeneralError(`Unable to add indirect dependency ${componentIdStr}, without "parent" parameter`);
      }
      this.addDependencyToParent(parent, componentIdStr);
    }
    if (this.components[componentIdStr]) {
      logger.info(`bit.map: updating an exiting component ${componentIdStr}`);
      const existingRootDir = this.components[componentIdStr].rootDir;
      if (existingRootDir) ComponentMap.changeFilesPathAccordingToItsRootDir(existingRootDir, files);
      if (override) {
        this.components[componentIdStr].files = files;
      } else {
        this._updateFilesWithCurrentLetterCases(componentIdStr, files);
        // override the current componentMap.files with the given files argument
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
      if (origin === COMPONENT_ORIGINS.IMPORTED || origin === COMPONENT_ORIGINS.AUTHORED) {
        // if there are older versions, the user is updating an existing component, delete old ones from bit.map
        this.deleteOlderVersionsOfComponent(componentId);
      }
      // $FlowFixMe not easy to fix, we can't instantiate ComponentMap with mainFile because we don't have it yet
      this.setComponent(componentIdStr, new ComponentMap({ files, origin }));
      this.components[componentIdStr].mainFile = this._getMainFile(
        pathNormalizeToLinux(mainFile),
        this.components[componentIdStr]
      );
    }
    if (rootDir) {
      // when rootDir is from the cli, it is changed to be absolute first (see write-components.writeToComponentsDir)
      // and on the next line it is changed to be relative to the project-root.
      // otherwise, rootDir may be originated from previous componentMap.rootDir value, as such,
      // when running the command from an inner directory we must not run _makePathRelativeToProjectRoot.
      const rootRelative = path.isAbsolute(rootDir) ? this._makePathRelativeToProjectRoot(rootDir) : rootDir;
      this.components[componentIdStr].rootDir = pathNormalizeToLinux(rootRelative);
    }
    if (trackDir) {
      this.components[componentIdStr].trackDir = pathNormalizeToLinux(trackDir);
    }
    this.components[componentIdStr].removeTrackDirIfNeeded();
    if (originallySharedDir) {
      this.components[componentIdStr].originallySharedDir = originallySharedDir;
    }
    this.components[componentIdStr].sort();
    this.components[componentIdStr].validate();
    this.markAsChanged();
    return this.components[componentIdStr];
  }

  addFilesToComponent({ componentId, files }: { componentId: BitId, files: ComponentMapFile[] }): ComponentMap {
    const componentIdStr = componentId.toString();
    if (!this.components[componentIdStr]) {
      throw new GeneralError(`unable to add files to a non-exist component ${componentIdStr}`);
    }
    const existingRootDir = this.components[componentIdStr].rootDir;
    if (existingRootDir) ComponentMap.changeFilesPathAccordingToItsRootDir(existingRootDir, files);
    if (this._areFilesArraysEqual(this.components[componentIdStr].files, files)) {
      return this.components[componentIdStr];
    }
    // do not override existing files, only add new files
    logger.info(`bit.map: updating an exiting component ${componentIdStr}`);
    this.components[componentIdStr].files = R.unionWith(
      R.eqBy(R.prop('relativePath')),
      this.components[componentIdStr].files,
      files
    );
    this.components[componentIdStr].sort();
    this.components[componentIdStr].validate();
    this.markAsChanged();
    return this.components[componentIdStr];
  }

  _invalidateCache = () => {
    this.paths = {};
    this.pathsLowerCase = {};
  };

  _removeFromComponentsArray(componentId: BitIdStr) {
    delete this.components[componentId];
    this.markAsChanged();
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
    this.markAsChanged();
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
      throw new GeneralError(`Your ${BIT_MAP} file has more than one version of ${id.toStringWithoutScopeAndVersion()} and they
      are authored or imported. This scenario is not supported`);
    }
    const olderComponentId = olderComponentsIds[0];
    logger.debug(`BitMap: updating an older component ${olderComponentId} with a newer component ${newIdString}`);
    const componentMap = this.components[olderComponentId];
    this._removeFromComponentsArray(olderComponentId);
    this.setComponent(newIdString, componentMap);

    // update the dependencies array if needed
    Object.keys(this.components).forEach((componentId) => {
      const component = this.components[componentId];
      if (component.dependencies && component.dependencies.includes(olderComponentId)) {
        component.dependencies = component.dependencies.filter(dependency => dependency !== olderComponentId);
        component.dependencies.push(newIdString);
      }
    });
    this.markAsChanged();
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
      if (!this.components[bitId] && shouldThrow) throw new MissingBitMapComponent(bitId.toString());
      return this.components[bitId];
    }
    const idWithVersion = Object.keys(this.components).find(
      componentId =>
        BitId.parse(componentId).toStringWithoutVersion() === bitId.toStringWithoutVersion() ||
        (includeSearchByBoxAndNameOnly &&
          BitId.parse(componentId).toStringWithoutScopeAndVersion() === bitId.toStringWithoutScopeAndVersion())
    );
    if (!idWithVersion && shouldThrow) throw new MissingBitMapComponent(bitId.toString());
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
  getComponentIdByPath(componentPath: string, caseSensitive: boolean = true): string {
    this._populateAllPaths();
    return caseSensitive ? this.paths[componentPath] : this.pathsLowerCase[componentPath.toLowerCase()];
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
          this.pathsLowerCase[relativeToConsumer.toLowerCase()] = componentId;
        });
      });
    }
  }

  updatePathLocation(
    from: PathOsBasedRelative,
    to: PathOsBasedRelative,
    existingPath: PathOsBasedAbsolute
  ): PathChangeResult[] {
    const isPathDir = isDir(existingPath);
    const allChanges = [];
    Object.keys(this.components).forEach((componentId) => {
      const componentMap: ComponentMap = this.components[componentId];
      const changes = isPathDir ? componentMap.updateDirLocation(from, to) : componentMap.updateFileLocation(from, to);
      if (changes && changes.length) allChanges.push({ id: componentId, changes });
    });
    if (R.isEmpty(allChanges)) {
      const errorMsg = isPathDir
        ? `directory ${from} is not a tracked component`
        : `the file ${existingPath} is untracked`;
      throw new GeneralError(errorMsg);
    }

    this.markAsChanged();
    return allChanges;
  }

  /**
   * do not call this function directly, let consumer.onDestroy() call it.
   * consumer.onDestroy() is being called (manually) at the end of the command process.
   * the risk of calling this method in other places is a parallel writing of this file, which
   * may result in a damaged file
   */
  async write(): Promise<any> {
    if (!this.hasChanged) return null;
    logger.debug('writing to bit.map');
    const bitMapContent = Object.assign({}, this.components, { version: this.version });
    return outputFile({ filePath: this.mapPath, content: JSON.stringify(bitMapContent, null, 4) });
  }
}
