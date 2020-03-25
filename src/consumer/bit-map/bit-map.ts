import * as path from 'path';
import fs from 'fs-extra';
import R from 'ramda';
import json from 'comment-json';
import logger from '../../logger/logger';
import { BIT_MAP, OLD_BIT_MAP, COMPONENT_ORIGINS, BIT_VERSION, VERSION_DELIMITER } from '../../constants';
import { InvalidBitMap, MissingBitMapComponent } from './exceptions';
import { BitId, BitIds } from '../../bit-id';
import { outputFile, pathNormalizeToLinux, pathJoinLinux, isDir, sortObject } from '../../utils';
import ComponentMap from './component-map';
import { ComponentMapFile, ComponentOrigin, PathChange } from './component-map';
import { PathLinux, PathOsBased, PathOsBasedRelative, PathOsBasedAbsolute, PathRelative } from '../../utils/path';
import { BitIdStr } from '../../bit-id/bit-id';
import ShowDoctorError from '../../error/show-doctor-error';

export type PathChangeResult = { id: BitId; changes: PathChange[] };
export type IgnoreFilesDirs = { files: PathLinux[]; dirs: PathLinux[] };

export default class BitMap {
  projectRoot: string;
  mapPath: string;
  components: ComponentMap[];
  hasChanged: boolean;
  version: string;
  paths: { [path: string]: BitId }; // path => componentId
  pathsLowerCase: { [path: string]: BitId }; // path => componentId
  markAsChangedBinded: Function;
  _cacheIds: { [origin: string]: BitIds | undefined };
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  allTrackDirs: { [trackDir: PathLinux]: BitId } | undefined;

  constructor(projectRoot: string, mapPath: string, version: string) {
    this.projectRoot = projectRoot;
    this.mapPath = mapPath;
    this.components = [];
    this.hasChanged = false;
    this.version = version;
    this.paths = {};
    this.pathsLowerCase = {};
    this._cacheIds = {};
    this.markAsChangedBinded = this.markAsChanged.bind(this);
  }

  markAsChanged() {
    this.hasChanged = true;
    this._invalidateCache();
  }

  setComponent(bitId: BitId, componentMap: ComponentMap) {
    const id = bitId.toString();
    if (!bitId.hasVersion() && bitId.scope) {
      throw new ShowDoctorError(
        `invalid bitmap id ${id}, a component must have a version when a scope-name is included`
      );
    }
    if (componentMap.origin !== COMPONENT_ORIGINS.NESTED) {
      // make sure there are no duplications (same name)
      const similarIds = this.findSimilarIds(bitId, true);
      if (similarIds.length) {
        throw new ShowDoctorError(`your id ${id} is duplicated with ${similarIds.toString()}`);
      }
    }

    componentMap.id = bitId;
    this.components.push(componentMap);
    this.markAsChanged();
  }

  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  setComponentProp(id: BitId, propName: keyof ComponentMap, val: any) {
    const componentMap = this.getComponent(id, { ignoreScopeAndVersion: true });
    componentMap[propName] = val;
    this.markAsChanged();
    return componentMap;
  }

  isEmpty() {
    return R.isEmpty(this.components);
  }

  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  removeComponentProp(id: BitId, propName: keyof ComponentMap) {
    const componentMap = this.getComponent(id, { ignoreScopeAndVersion: true });
    delete componentMap[propName];
    this.markAsChanged();
    return componentMap;
  }

  static load(dirPath: PathOsBasedAbsolute): BitMap {
    const { currentLocation, defaultLocation } = BitMap.getBitMapLocation(dirPath);
    const mapFileContent = BitMap.loadRawSync(dirPath);
    if (!mapFileContent || !currentLocation) {
      return new BitMap(dirPath, defaultLocation, BIT_VERSION);
    }
    let componentsJson;
    try {
      componentsJson = json.parse(mapFileContent.toString('utf8'), undefined, true);
    } catch (e) {
      logger.error(`invalid bitmap at ${currentLocation}`, e);
      throw new InvalidBitMap(currentLocation, e.message);
    }
    const version = componentsJson.version;
    // Don't treat version like component
    delete componentsJson.version;

    const bitMap = new BitMap(dirPath, currentLocation, version);
    bitMap.loadComponents(componentsJson);
    return bitMap;
  }

  static loadRawSync(dirPath: PathOsBasedAbsolute): Buffer | undefined {
    const { currentLocation } = BitMap.getBitMapLocation(dirPath);
    if (!currentLocation) {
      logger.info(`bit.map: unable to find an existing ${BIT_MAP} file. Will create a new one if needed`);
      return undefined;
    }
    const mapFileContent = fs.readFileSync(currentLocation);
    return mapFileContent;
  }

  static getBitMapLocation(dirPath: PathOsBasedAbsolute) {
    const defaultLocation = path.join(dirPath, BIT_MAP);
    const oldLocation = path.join(dirPath, OLD_BIT_MAP);
    const getCurrentLocation = (): PathOsBased | undefined => {
      if (fs.existsSync(defaultLocation)) return defaultLocation;
      if (fs.existsSync(oldLocation)) return oldLocation;
      return undefined;
    };
    const currentLocation = getCurrentLocation();
    return { currentLocation, defaultLocation };
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

  loadComponents(componentsJson: Record<string, any>) {
    Object.keys(componentsJson).forEach(componentId => {
      const componentFromJson = componentsJson[componentId];
      const idHasScope = (): boolean => {
        if (componentFromJson.origin !== COMPONENT_ORIGINS.AUTHORED) return true;
        if ('exported' in componentFromJson) {
          return componentFromJson.exported;
        }
        // backward compatibility
        return BitId.parseObsolete(componentId).hasScope();
      };
      componentFromJson.id = BitId.parse(componentId, idHasScope());
      const componentMap = ComponentMap.fromJson(componentsJson[componentId]);
      componentMap.setMarkAsChangedCb(this.markAsChangedBinded);
      this.components.push(componentMap);
    });
  }

  getAllComponents(origin?: ComponentOrigin | ComponentOrigin[]): ComponentMap[] {
    if (!origin) return this.components;
    const isOriginMatch = component => component.origin === origin;
    // $FlowFixMe we know origin is an array in that case
    const isOriginMatchArray = component => origin.includes(component.origin);
    const filter = Array.isArray(origin) ? isOriginMatchArray : isOriginMatch;
    return R.filter(filter, this.components);
  }

  getAllBitIds(origin?: ComponentOrigin[]): BitIds {
    const ids = (componentMaps: ComponentMap[]) => BitIds.fromArray(componentMaps.map(c => c.id));
    const getIdsOfOrigin = (oneOrigin?: ComponentOrigin): BitIds => {
      const cacheKey = oneOrigin || 'all';
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      if (this._cacheIds[cacheKey]) return this._cacheIds[cacheKey];
      const allComponents = this.components;
      const components = oneOrigin ? allComponents.filter(c => c.origin === oneOrigin) : allComponents;
      const componentIds = ids(components);
      this._cacheIds[cacheKey] = componentIds;
      return componentIds;
    };

    if (!origin) return getIdsOfOrigin();
    return BitIds.fromArray(R.flatten(origin.map(oneOrigin => getIdsOfOrigin(oneOrigin))));
  }

  /**
   * get existing bitmap bit-id by bit-id.
   * throw an exception if not found
   * @see also getBitIdIfExist
   */
  getBitId(
    bitId: BitId,
    {
      ignoreVersion = false,
      ignoreScopeAndVersion = false
    }: {
      ignoreVersion?: boolean;
      ignoreScopeAndVersion?: boolean;
    } = {}
  ): BitId {
    if (!(bitId instanceof BitId)) {
      throw new TypeError(`BitMap.getBitId expects bitId to be an instance of BitId, instead, got ${bitId}`);
    }
    const allIds = this.getAllBitIds();
    const exactMatch = allIds.search(bitId);
    if (exactMatch) return exactMatch;
    if (ignoreVersion) {
      const matchWithoutVersion = allIds.searchWithoutVersion(bitId);
      if (matchWithoutVersion) return matchWithoutVersion;
    }
    if (ignoreScopeAndVersion) {
      const matchWithoutScopeAndVersion = allIds.searchWithoutScopeAndVersion(bitId);
      if (matchWithoutScopeAndVersion) return matchWithoutScopeAndVersion;
    }
    throw new MissingBitMapComponent(bitId.toString());
  }

  /**
   * get existing bitmap bit-id by bit-id
   * don't throw an exception if not found
   * @see also getBitId
   */
  getBitIdIfExist(
    bitId: BitId,
    {
      ignoreVersion = false,
      ignoreScopeAndVersion = false
    }: {
      ignoreVersion?: boolean;
      ignoreScopeAndVersion?: boolean;
    } = {}
  ): BitId | undefined {
    try {
      const existingBitId = this.getBitId(bitId, { ignoreVersion, ignoreScopeAndVersion });
      return existingBitId;
    } catch (err) {
      if (err instanceof MissingBitMapComponent) return undefined;
      throw err;
    }
  }

  /**
   * get componentMap from bitmap by bit-id.
   * throw an exception if not found.
   * @see also getComponentIfExist
   */
  getComponent(
    bitId: BitId,
    {
      ignoreVersion = false,
      ignoreScopeAndVersion = false
    }: {
      ignoreVersion?: boolean;
      ignoreScopeAndVersion?: boolean;
    } = {}
  ): ComponentMap {
    const existingBitId: BitId = this.getBitId(bitId, { ignoreVersion, ignoreScopeAndVersion });
    return this.components.find(c => c.id.isEqual(existingBitId)) as ComponentMap;
  }

  /**
   * get componentMap from bitmap by bit-id
   * don't throw an exception if not found
   * @see also getComponent
   */
  getComponentIfExist(
    bitId: BitId,
    {
      ignoreVersion = false,
      ignoreScopeAndVersion = false
    }: {
      ignoreVersion?: boolean;
      ignoreScopeAndVersion?: boolean;
    } = {}
  ): ComponentMap | undefined {
    try {
      const componentMap = this.getComponent(bitId, { ignoreVersion, ignoreScopeAndVersion });
      return componentMap;
    } catch (err) {
      if (err instanceof MissingBitMapComponent) return undefined;
      throw err;
    }
  }

  getNonNestedComponentIfExist(bitId: BitId): ComponentMap | undefined {
    const nonNestedIds = this.getAllBitIds([COMPONENT_ORIGINS.IMPORTED, COMPONENT_ORIGINS.AUTHORED]);
    const id: BitId | undefined = nonNestedIds.searchWithoutScopeAndVersion(bitId);
    if (!id) return undefined;
    return this.getComponent(id);
  }

  getComponentPreferNonNested(bitId: BitId): ComponentMap | undefined {
    return this.getNonNestedComponentIfExist(bitId) || this.getComponentIfExist(bitId, { ignoreVersion: true });
  }

  getAuthoredAndImportedBitIds(): BitIds {
    return this.getAllBitIds([COMPONENT_ORIGINS.AUTHORED, COMPONENT_ORIGINS.IMPORTED]);
  }

  getAuthoredExportedComponents(): BitId[] {
    const authoredIds = this.getAllBitIds([COMPONENT_ORIGINS.AUTHORED]);
    return authoredIds.filter(id => id.hasScope());
  }

  _makePathRelativeToProjectRoot(pathToChange: PathRelative): PathOsBasedRelative {
    const absolutePath = path.resolve(pathToChange);
    return path.relative(this.projectRoot, absolutePath);
  }

  /**
   * find ids that have the same name but different version
   * if compareWithoutScope is false, the scope should be identical in addition to the name
   */
  findSimilarIds(id: BitId, compareWithoutScope = false): BitIds {
    const allIds = this.getAllBitIds([COMPONENT_ORIGINS.IMPORTED, COMPONENT_ORIGINS.AUTHORED]);
    const similarIds = allIds.filter((existingId: BitId) => {
      const isSimilar = compareWithoutScope
        ? existingId.isEqualWithoutScopeAndVersion(id)
        : existingId.isEqualWithoutVersion(id);
      return isSimilar && !existingId.isEqual(id);
    });
    return BitIds.fromArray(similarIds);
  }

  deleteOlderVersionsOfComponent(componentId: BitId): void {
    const similarIds = this.findSimilarIds(componentId);
    similarIds.forEach(id => {
      const idStr = id.toString();
      logger.debugAndAddBreadCrumb(
        'BitMap.deleteOlderVersionsOfComponent',
        'deleting an older version {idStr} of an existing component {componentId}',
        { idStr, componentId: componentId.toString() }
      );
      this._removeFromComponentsArray(id);
    });
  }

  /**
   * --- Don't use this function when you have the ID parsed. Use this.getBitId() instead ---
   *
   * id entered by the user may or may not include scope-name
   * search for a similar id in the bitmap and return the full BitId
   */
  getExistingBitId(id: BitIdStr, shouldThrow = true): BitId | undefined {
    if (!R.is(String, id)) {
      throw new TypeError(`BitMap.getExistingBitId expects id to be a string, instead, got ${typeof id}`);
    }
    const idHasVersion = id.includes(VERSION_DELIMITER);

    // start with a more strict comparison. assume the id from the user has a scope name
    const componentWithScope = this.components.find((componentMap: ComponentMap) => {
      return idHasVersion ? componentMap.id.toString() === id : componentMap.id.toStringWithoutVersion() === id;
    });
    if (componentWithScope) return componentWithScope.id;

    // continue with searching without the scope name
    const idWithoutVersion = BitId.getStringWithoutVersion(id);
    const componentWithoutScope = this.components.find((componentMap: ComponentMap) => {
      return idHasVersion
        ? componentMap.id.toStringWithoutScope() === id
        : componentMap.id.toStringWithoutScopeAndVersion() === idWithoutVersion;
    });
    if (componentWithoutScope) return componentWithoutScope.id;
    if (shouldThrow) {
      throw new MissingBitMapComponent(id);
    }
    return undefined;
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

  addComponent({
    componentId,
    files,
    mainFile,
    origin,
    rootDir,
    trackDir,
    originallySharedDir,
    wrapDir
  }: {
    componentId: BitId;
    files: ComponentMapFile[];
    mainFile: PathLinux;
    origin: ComponentOrigin;
    rootDir?: PathOsBasedAbsolute | PathOsBasedRelative;
    trackDir?: PathOsBased;
    originallySharedDir?: PathLinux;
    wrapDir?: PathLinux;
  }): ComponentMap {
    const componentIdStr = componentId.toString();
    logger.debug(`adding to bit.map ${componentIdStr}`);

    const getOrCreateComponentMap = (): ComponentMap => {
      const componentMap = this.getComponentIfExist(componentId);
      if (componentMap) {
        logger.info(`bit.map: updating an exiting component ${componentIdStr}`);
        componentMap.files = files;
        return componentMap;
      }
      if (origin === COMPONENT_ORIGINS.IMPORTED || origin === COMPONENT_ORIGINS.AUTHORED) {
        // if there are older versions, the user is updating an existing component, delete old ones from bit.map
        this.deleteOlderVersionsOfComponent(componentId);
      }
      // @ts-ignore not easy to fix, we can't instantiate ComponentMap with mainFile because we don't have it yet
      const newComponentMap = new ComponentMap({ files, origin });
      newComponentMap.setMarkAsChangedCb(this.markAsChangedBinded);
      this.setComponent(componentId, newComponentMap);
      return newComponentMap;
    };
    const componentMap = getOrCreateComponentMap();
    componentMap.mainFile = mainFile;
    if (rootDir) {
      componentMap.rootDir = pathNormalizeToLinux(rootDir);
    }
    if (trackDir) {
      componentMap.trackDir = pathNormalizeToLinux(trackDir);
    }
    if (wrapDir) {
      componentMap.wrapDir = wrapDir;
    }
    componentMap.removeTrackDirIfNeeded();
    if (originallySharedDir) {
      componentMap.originallySharedDir = originallySharedDir;
    }
    this.sortValidateAndMarkAsChanged(componentMap);
    return componentMap;
  }

  addFilesToComponent({ componentId, files }: { componentId: BitId; files: ComponentMapFile[] }): ComponentMap {
    const componentIdStr = componentId.toString();
    const componentMap = this.getComponentIfExist(componentId);
    if (!componentMap) {
      throw new ShowDoctorError(`unable to add files to a non-exist component ${componentIdStr}`);
    }
    logger.info(`bit.map: updating an exiting component ${componentIdStr}`);
    componentMap.files = files;
    this.sortValidateAndMarkAsChanged(componentMap);
    return componentMap;
  }

  sortValidateAndMarkAsChanged(componentMap: ComponentMap) {
    componentMap.sort();
    componentMap.validate();
    this.markAsChanged();
  }

  _invalidateCache = () => {
    this.paths = {};
    this.pathsLowerCase = {};
    this._cacheIds = {};
    this.allTrackDirs = undefined;
  };

  _removeFromComponentsArray(componentId: BitId) {
    this.components = this.components.filter(componentMap => !componentMap.id.isEqual(componentId));
    this.markAsChanged();
  }

  removeComponent(bitId: BitId) {
    const bitmapComponent = this.getBitIdIfExist(bitId, { ignoreScopeAndVersion: true });
    if (bitmapComponent) this._removeFromComponentsArray(bitmapComponent);
    return bitmapComponent;
  }
  removeComponents(ids: BitIds) {
    return ids.map(id => this.removeComponent(id));
  }

  isExistWithSameVersion(id: BitId): boolean {
    return Boolean(id.hasVersion() && this.getComponentIfExist(id));
  }

  /**
   * needed after exporting or tagging a component.
   * We don't support export/tag of nested components, only authored or imported. For authored/imported components, could be
   * in the file-system only one instance with the same component-name. As a result, we can strip the
   * scope-name and the version, find the older version in bit.map and update the id with the new one.
   */
  updateComponentId(id: BitId, updateScopeOnly = false): BitId {
    const newIdString = id.toString();
    const similarIds = this.findSimilarIds(id, true);
    if (!similarIds.length) {
      logger.debug(`bit-map: no need to update ${newIdString}`);
      return id;
    }
    if (similarIds.length > 1) {
      throw new ShowDoctorError(`Your ${BIT_MAP} file has more than one version of ${id.toStringWithoutScopeAndVersion()} and they
      are authored or imported. This scenario is not supported`);
    }
    const oldId: BitId = similarIds[0];
    const oldIdStr = oldId.toString();
    const newId = updateScopeOnly ? oldId.changeScope(id.scope) : id;
    if (newId.isEqual(oldId)) {
      logger.debug(`bit-map: no need to update ${oldIdStr}`);
      return oldId;
    }
    logger.debug(`BitMap: updating an older component ${oldIdStr} with a newer component ${newId.toString()}`);
    const componentMap = this.getComponent(oldId);
    if (componentMap.origin === COMPONENT_ORIGINS.NESTED) {
      throw new Error('updateComponentId should not manipulate Nested components');
    }
    this._removeFromComponentsArray(oldId);
    this.setComponent(newId, componentMap);
    this.markAsChanged();
    return newId;
  }

  /**
   * Return a component id as listed in bit.map file
   * by a path exist in the files object
   *
   * @param {string} componentPath relative to consumer - as stored in bit.map files object
   * @returns {BitId} component id
   * @memberof BitMap
   */
  getComponentIdByPath(componentPath: PathLinux, caseSensitive = true): BitId {
    this._populateAllPaths();
    return caseSensitive ? this.paths[componentPath] : this.pathsLowerCase[componentPath.toLowerCase()];
  }

  _populateAllPaths() {
    if (R.isEmpty(this.paths)) {
      this.components.forEach(component => {
        component.files.forEach(file => {
          const relativeToConsumer = component.rootDir
            ? pathJoinLinux(component.rootDir, file.relativePath)
            : file.relativePath;
          this.paths[relativeToConsumer] = component.id;
          this.pathsLowerCase[relativeToConsumer.toLowerCase()] = component.id;
        });
      });
    }
  }

  getAllTrackDirs() {
    if (!this.allTrackDirs) {
      this.allTrackDirs = {};
      this.components.forEach(component => {
        const trackDir = component.getTrackDir();
        if (!trackDir) return;
        // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
        this.allTrackDirs[trackDir] = component.id;
      });
    }
    return this.allTrackDirs;
  }

  updatePathLocation(
    from: PathOsBasedRelative,
    to: PathOsBasedRelative,
    existingPath: PathOsBasedAbsolute
  ): PathChangeResult[] {
    const isPathDir = isDir(existingPath);
    const allChanges = [];
    this.components.forEach(componentMap => {
      const changes = isPathDir ? componentMap.updateDirLocation(from, to) : componentMap.updateFileLocation(from, to);
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      if (changes && changes.length) allChanges.push({ id: componentMap.id.clone(), changes });
    });
    if (R.isEmpty(allChanges)) {
      const errorMsg = isPathDir
        ? `directory ${from} is not a tracked component`
        : `the file ${existingPath} is untracked`;
      throw new ShowDoctorError(errorMsg);
    }

    this.markAsChanged();
    return allChanges;
  }

  /**
   * remove the id property before saving the components to the file as they are redundant with the keys
   */
  toObjects(): Record<string, any> {
    const components = {};
    this.components.forEach(componentMap => {
      const componentMapCloned = componentMap.clone();
      if (componentMapCloned.origin === COMPONENT_ORIGINS.AUTHORED) {
        componentMapCloned.exported = componentMapCloned.id.hasScope();
      }
      const idStr = componentMapCloned.id.toString();
      delete componentMapCloned.id;
      components[idStr] = componentMapCloned.toPlainObject();
    });

    return sortObject(components);
  }

  /**
   * do not call this function directly, let consumer.onDestroy() call it.
   * consumer.onDestroy() is being called (manually) at the end of the command process.
   * the risk of calling this method in other places is a parallel writing of this file, which
   * may result in a damaged file
   */
  async write(): Promise<any> {
    if (!this.hasChanged) return undefined;
    logger.debug('writing to bit.map');
    const bitMapContent = this.getContent();
    return outputFile({ filePath: this.mapPath, content: JSON.stringify(bitMapContent, null, 4) });
  }

  getContent(): Record<string, any> {
    const bitMapContent = Object.assign({}, this.toObjects(), { version: this.version });
    return bitMapContent;
  }
}
