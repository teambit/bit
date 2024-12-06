import objectHash from 'object-hash';
import json from 'comment-json';
import fs from 'fs-extra';
import * as path from 'path';
import { compact, uniq } from 'lodash';
import R from 'ramda';
import { LaneId } from '@teambit/lane-id';
import { BitError } from '@teambit/bit-error';
import { ComponentID, ComponentIdList } from '@teambit/component-id';
import { BitId, BitIdStr } from '@teambit/legacy-bit-id';
import { sortObjectByKeys } from '@teambit/toolbox.object.sorter';
import type { Consumer } from '@teambit/legacy.consumer';
import {
  AUTO_GENERATED_MSG,
  AUTO_GENERATED_STAMP,
  BIT_MAP,
  OLD_BIT_MAP,
  VERSION_DELIMITER,
  BITMAP_PREFIX_MESSAGE,
} from '@teambit/legacy.constants';
import { logger } from '@teambit/legacy.logger';
import {
  pathJoinLinux,
  pathNormalizeToLinux,
  PathLinux,
  PathLinuxRelative,
  PathOsBased,
  PathOsBasedAbsolute,
  PathOsBasedRelative,
} from '@teambit/toolbox.path.path';
import {
  ComponentMap,
  ComponentMapFile,
  Config,
  PathChange,
  getFilesByDir,
  getGitIgnoreHarmony,
} from './component-map';
import { InvalidBitMap, MissingBitMapComponent } from './exceptions';
import { DuplicateRootDir } from './exceptions/duplicate-root-dir';

export type PathChangeResult = { id: ComponentID; changes: PathChange[] };
export type IgnoreFilesDirs = { files: PathLinux[]; dirs: PathLinux[] };
export type GetBitMapComponentOptions = {
  ignoreVersion?: boolean;
};

export type MergeOptions = {
  mergeStrategy?: 'theirs' | 'ours' | 'manual';
};

export const LANE_KEY = '_bit_lane';
/**
 * schema 16.0.0 - deprecated the "onLanesOnly"
 * schema 17.0.0 - supports duplicate names with different scopes, in which case the key is scope/name. also added "name" prop.
 */
export const CURRENT_BITMAP_SCHEMA = '17.0.0';
export const SCHEMA_FIELD = '$schema-version';

export class BitMap {
  components: ComponentMap[];
  hasChanged: boolean;
  paths: { [path: string]: ComponentID }; // path => componentId
  pathsLowerCase: { [path: string]: ComponentID }; // path => componentId
  markAsChangedBinded: Function;
  _cacheIdsAll: ComponentIdList | undefined;
  _cacheIdsLane: ComponentIdList | undefined;
  _cacheIdsLaneIncludeRemoved: ComponentIdList | undefined;
  _cacheIdsAllStr: { [idStr: string]: ComponentID } | undefined;
  _cacheIdsAllStrWithoutScope: { [idStr: string]: ComponentID } | undefined;
  _cacheIdsAllStrWithoutVersion: { [idStr: string]: ComponentID } | undefined;
  _cacheIdsAllStrWithoutScopeAndVersion: { [idStr: string]: ComponentID } | undefined;
  allTrackDirs: { [trackDir: string]: ComponentID } | null | undefined;
  protected updatedIds: { [oldIdStr: string]: ComponentMap } = {}; // needed for out-of-sync where the id is changed during the process
  constructor(
    public projectRoot: string,
    public mapPath: PathOsBasedAbsolute,
    public schema: string,
    public laneId?: LaneId,
    public isLaneExported = false
  ) {
    this.components = [];
    this.hasChanged = false;
    this.paths = {};
    this.pathsLowerCase = {};
    this.markAsChangedBinded = this.markAsChanged.bind(this);
  }

  markAsChanged() {
    this.hasChanged = true;
    this._invalidateCache();
  }

  setComponent(componentId: ComponentID, componentMap: ComponentMap) {
    const id = componentId.toString();
    if (!componentId.hasVersion() && componentId._legacy.scope) {
      throw new BitError(`invalid bitmap id ${id}, a component must have a version when a scope-name is included`);
    }
    componentMap.id = componentId;
    this.components.push(componentMap);
    this.markAsChanged();
  }

  /**
   * in case the added component's root-dir is a parent-dir of other components
   * or other component's root-dir is a parent root-dir of this component, throw an error
   */
  private throwForExistingParentDir({ id, rootDir }: ComponentMap) {
    const isParentDir = (parent: string, child: string) => {
      const relative = path.relative(parent, child);
      return relative && !relative.startsWith('..');
    };
    this.components.forEach((existingComponentMap) => {
      if (!existingComponentMap.rootDir) return;
      if (isParentDir(existingComponentMap.rootDir, rootDir)) {
        throw new BitError(
          `unable to add "${id.toString()}", its rootDir ${rootDir} is inside ${
            existingComponentMap.rootDir
          } which used by another component "${existingComponentMap.id.toString()}"`
        );
      }
      if (isParentDir(rootDir, existingComponentMap.rootDir)) {
        throw new BitError(
          `unable to add "${id.toString()}", its rootDir ${rootDir} is used by another component ${existingComponentMap.id.toString()}`
        );
      }
    });
  }

  setOnLanesOnly(id: ComponentID, value: boolean) {
    const componentMap = this.getComponent(id, { ignoreVersion: true });
    componentMap.onLanesOnly = value;
    this.markAsChanged();
    return componentMap;
  }

  isEmpty() {
    return R.isEmpty(this.components);
  }

  static mergeContent(rawContent: string, otherRawContent: string, opts: MergeOptions = {}): string {
    const parsed = json.parse(rawContent, undefined, true);
    const parsedOther = json.parse(otherRawContent, undefined, true);
    const merged = {};
    if (opts.mergeStrategy === 'ours') {
      Object.assign(merged, parsedOther, parsed);
    } else if (opts.mergeStrategy === 'theirs') {
      Object.assign(merged, parsed, parsedOther);
    } else {
      Object.assign(merged, parsedOther, parsed);
      const merged2 = Object.assign({}, parsed, parsedOther);
      // The easiest way to check for conflicts is to compare the hash of the merged object
      // once when other is first and once when ours is first
      if (objectHash(merged) !== objectHash(merged2)) {
        throw new BitError(
          'conflict merging Bitmap, you need to resolve the conflict manually or choose "ours" or "theirs" strategy'
        );
      }
    }
    const sorted = sortObjectByKeys(merged);
    // Delete and re-add it to make sure it will be at the end
    delete sorted[SCHEMA_FIELD];
    sorted[SCHEMA_FIELD] = parsed[SCHEMA_FIELD];
    const result = `${AUTO_GENERATED_MSG}${BITMAP_PREFIX_MESSAGE}${JSON.stringify(sorted, null, 4)}`;
    return result;
  }

  static async load(consumer: Consumer): Promise<BitMap> {
    const dirPath: PathOsBasedAbsolute = consumer.getPath();
    const { currentLocation, defaultLocation } = BitMap.getBitMapLocation(dirPath);
    const mapFileContent = BitMap.loadRawSync(dirPath);
    if (!mapFileContent || !currentLocation) {
      return new BitMap(dirPath, defaultLocation, CURRENT_BITMAP_SCHEMA);
    }
    const defaultScope = consumer.config.defaultScope;
    const bitMap = BitMap.loadFromContentWithoutLoadingFiles(mapFileContent, currentLocation, dirPath, defaultScope);
    await bitMap.loadFiles();

    return bitMap;
  }

  /**
   * helpful for external tools to get an object representation of the .bitmap file quickly.
   * keep in mind that ComponentMap are not complete because they don't have the filepaths inside each component, only the rootDir.
   */
  static loadFromContentWithoutLoadingFiles(
    bitMapFileContent: Buffer,
    bitMapFilePath: PathOsBasedAbsolute,
    workspacePath: PathOsBasedAbsolute,
    defaultScope: string
  ) {
    let componentsJson;
    try {
      componentsJson = json.parse(bitMapFileContent.toString('utf8'), undefined, true);
    } catch (e: any) {
      logger.error(`invalid bitmap at ${bitMapFilePath}`, e);
      throw new InvalidBitMap(bitMapFilePath, e.message);
    }
    const schema = componentsJson[SCHEMA_FIELD] || componentsJson.version;
    let isLaneExported = false;
    let laneId: LaneId | undefined;
    if (componentsJson[LANE_KEY]) {
      laneId = new LaneId(componentsJson[LANE_KEY].id);
      isLaneExported = componentsJson[LANE_KEY].exported;
    }
    BitMap.removeNonComponentFields(componentsJson);

    const bitMap = new BitMap(workspacePath, bitMapFilePath, schema, laneId, isLaneExported);
    bitMap.loadComponents(componentsJson, defaultScope);

    return bitMap;
  }

  static removeNonComponentFields(componentsJson: Record<string, any>) {
    // Don't treat version like component
    componentsJson[SCHEMA_FIELD] ? delete componentsJson[SCHEMA_FIELD] : delete componentsJson.version;
    delete componentsJson[LANE_KEY];
  }

  async loadFiles() {
    const gitIgnore = await getGitIgnoreHarmony(this.projectRoot);
    await Promise.all(
      this.components.map(async (componentMap) => {
        const rootDir = componentMap.rootDir;
        if (!rootDir) return;
        try {
          componentMap.files = await getFilesByDir(rootDir, this.projectRoot, gitIgnore);
          componentMap.recentlyTracked = true;
        } catch (err: any) {
          componentMap.files = [];
          componentMap.noFilesError = err;
        }
      })
    );
  }

  static loadRawSync(dirPath: PathOsBasedAbsolute): Buffer | undefined {
    const { currentLocation } = BitMap.getBitMapLocation(dirPath);
    if (!currentLocation) {
      logger.info(`BitMap, unable to find an existing ${BIT_MAP} file. Will create a new one if needed`);
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
      logger.info(`BitMap, deleting the .bitmap file at ${bitMapPath}`);
      fs.removeSync(bitMapPath);
    };
    if (resetHard) {
      deleteBitMapFile();
      return;
    }
    try {
      const mapFileContent = BitMap.loadRawSync(dirPath);
      if (!mapFileContent) return;
      json.parse(mapFileContent.toString('utf8'), undefined, true);
    } catch (err: any) {
      deleteBitMapFile();
    }
  }

  resetToNewComponents() {
    this.components = this.components.map((component) => {
      const scope = component.id.scope;
      const legacyId = component.id._legacy.changeVersion(undefined).changeScope(undefined);
      const id = new ComponentID(legacyId, scope);
      return new ComponentMap({
        id,
        mainFile: component.mainFile,
        rootDir: component.rootDir,
        defaultScope: scope,
        exported: false,
        files: component.files,
        onLanesOnly: false,
      });
    });
  }

  resetLaneComponentsToNew() {
    this.components = this.components.map((component) => {
      if (component.isAvailableOnCurrentLane) return component;
      return new ComponentMap({
        id: component.id.changeVersion(undefined).changeScope(component.scope || (component.defaultScope as string)),
        mainFile: component.mainFile,
        rootDir: component.rootDir,
        defaultScope: component.id.scope,
        exported: false,
        files: component.files,
        onLanesOnly: false,
      });
    });
  }

  private throwForDuplicateRootDirs(componentsJson: Record<string, any>) {
    const rootDirs = compact(Object.keys(componentsJson).map((c) => componentsJson[c].rootDir));
    if (uniq(rootDirs).length === rootDirs.length) {
      return; // no duplications
    }
    Object.keys(componentsJson).forEach((componentId) => {
      const rootDir = componentsJson[componentId].rootDir;
      if (!rootDir) return;
      const idsWithSameRootDir = Object.keys(componentsJson).filter((id) => componentsJson[id].rootDir === rootDir);
      if (idsWithSameRootDir.length > 1) {
        throw new DuplicateRootDir(rootDir, idsWithSameRootDir);
      }
    });
  }

  addFromComponentJson(id: ComponentID, componentFromJson: Record<string, any>) {
    componentFromJson.id = id;
    const componentMap = ComponentMap.fromJson(componentFromJson as any);
    this.components.push(componentMap);
    this.markAsChanged();
  }

  loadComponents(componentsJson: Record<string, any>, defaultScope: string) {
    this.throwForDuplicateRootDirs(componentsJson);
    Object.keys(componentsJson).forEach((componentId) => {
      const componentFromJson = componentsJson[componentId];
      const compId = BitMap.getComponentIdFromComponentJson(componentId, componentFromJson, defaultScope);
      componentFromJson.id = compId;
      const componentMap = ComponentMap.fromJson(componentFromJson);
      componentMap.setMarkAsChangedCb(this.markAsChangedBinded);
      this.components.push(componentMap);
    });
  }

  static getComponentIdFromComponentJson(
    componentId: string,
    componentFromJson: Record<string, any>,
    defaultScope: string
  ): ComponentID {
    const bitId = BitMap.getBitIdFromComponentJson(componentId, componentFromJson);
    if (bitId.hasScope() && !bitId.hasVersion()) {
      throw new BitError(
        `.bitmap entry of "${componentId}" is invalid, it has a scope-name "${bitId.scope}", however, it does not have any version`
      );
    }
    if (!bitId.hasScope() && !componentFromJson.defaultScope) {
      // needed for backward compatibility. before scheme 17.0.0, the defaultScope wasn't written if it was the same
      // as consumer.defaultScope
      componentFromJson.defaultScope = defaultScope;
    }
    return new ComponentID(bitId, componentFromJson.defaultScope);
  }

  static getBitIdFromComponentJson(componentId: string, componentFromJson: Record<string, any>): BitId {
    const newHarmonyFormat = 'scope' in componentFromJson;
    if (!newHarmonyFormat) throw new Error(`.bitmap entry for ${componentId} is missing "scope" property`);
    // bitmap schema <= 16.0.0 used the key as the name.
    // bitmap schema > 16.0.0 uses the "name" property because they key might be scope/name to support multiple-names same-scope
    const name = componentFromJson.name || componentId;
    const bitId = new BitId({
      scope: componentFromJson.scope,
      name,
      version: componentFromJson.version,
    });
    // it needs to be parsed for 1) validation 2) adding "latest" to the version if needed.
    return BitId.parse(bitId.toString(), bitId.hasScope());
  }

  getAllComponents(): ComponentMap[] {
    return this.components;
  }

  /**
   * important! you probably want to use "getAllIdsAvailableOnLane".
   * this method returns ids that are not available on the current lane and will throw errors when
   * trying to load them.
   */
  getAllBitIdsFromAllLanes(): ComponentIdList {
    const ids = (componentMaps: ComponentMap[]) => ComponentIdList.fromArray(componentMaps.map((c) => c.id));
    if (this._cacheIdsAll) return this._cacheIdsAll;
    const components = this.components;
    const componentIds = ids(components);
    this._cacheIdsAll = componentIds;
    return componentIds;
  }

  getAllIdsStr(): Record<string, ComponentID> {
    if (!this._cacheIdsAllStr) {
      const allIds = this.getAllBitIdsFromAllLanes();
      this._cacheIdsAllStr = allIds.reduce((acc, id) => {
        acc[id.toString()] = id;
        return acc;
      }, {});
    }
    return this._cacheIdsAllStr;
  }
  getAllIdsStrWithoutScope(): Record<string, ComponentID> {
    if (!this._cacheIdsAllStrWithoutScope) {
      const allIds = this.getAllBitIdsFromAllLanes();
      this._cacheIdsAllStrWithoutScope = allIds.reduce((acc, id) => {
        acc[id._legacy.toStringWithoutScope()] = id;
        return acc;
      }, {});
    }
    return this._cacheIdsAllStrWithoutScope;
  }
  getAllIdsStrWithoutVersion(): Record<string, ComponentID> {
    if (!this._cacheIdsAllStrWithoutVersion) {
      const allIds = this.getAllBitIdsFromAllLanes();
      this._cacheIdsAllStrWithoutVersion = allIds.reduce((acc, id) => {
        acc[id.toStringWithoutVersion()] = id;
        return acc;
      }, {});
    }
    return this._cacheIdsAllStrWithoutVersion;
  }
  getAllIdsStrWithoutScopeAndVersion(): Record<string, ComponentID> {
    if (!this._cacheIdsAllStrWithoutScopeAndVersion) {
      const allIds = this.getAllBitIdsFromAllLanes();
      this._cacheIdsAllStrWithoutScopeAndVersion = allIds.reduce((acc, id) => {
        acc[id.fullName] = id;
        return acc;
      }, {});
    }
    return this._cacheIdsAllStrWithoutScopeAndVersion;
  }

  getAllIdsAvailableOnLane(): ComponentIdList {
    if (!this._cacheIdsLane) {
      const components = this.components.filter((c) => !c.isRemoved()).filter((c) => c.isAvailableOnCurrentLane);
      const componentIds = ComponentIdList.fromArray(components.map((c) => c.id));
      this._cacheIdsLane = componentIds;
      Object.freeze(this._cacheIdsLane);
    }
    return this._cacheIdsLane;
  }

  getAllIdsAvailableOnLaneIncludeRemoved(): ComponentIdList {
    if (!this._cacheIdsLaneIncludeRemoved) {
      const idsFromBitMap = this.getAllIdsAvailableOnLane();
      const removedIds = this.getRemoved();
      this._cacheIdsLaneIncludeRemoved = ComponentIdList.fromArray([...idsFromBitMap, ...removedIds]);
      Object.freeze(this._cacheIdsLaneIncludeRemoved);
    }
    return this._cacheIdsLaneIncludeRemoved;
  }

  getRemoved(): ComponentIdList {
    const components = this.components.filter((c) => c.isRemoved()).filter((c) => c.isAvailableOnCurrentLane);
    return ComponentIdList.fromArray(components.map((c) => c.id));
  }

  isIdAvailableOnCurrentLane(id: ComponentID): boolean {
    const allIdsOfCurrentLane = this.getAllIdsAvailableOnLane();
    return allIdsOfCurrentLane.hasWithoutScopeAndVersion(id);
  }

  /**
   * get existing bitmap bit-id by bit-id.
   * throw an exception if not found
   * @see also getComponentIdIfExist
   */
  getComponentId(componentId: ComponentID, { ignoreVersion = false }: GetBitMapComponentOptions = {}): ComponentID {
    if (componentId.constructor.name !== ComponentID.name) {
      throw new TypeError(
        `BitMap.getComponentId expects componentId to be an instance of ComponentID, instead, got ${componentId}`
      );
    }
    const allIds = this.getAllBitIdsFromAllLanes();
    const exactMatch = allIds.search(componentId);
    if (exactMatch) return exactMatch;
    if (ignoreVersion) {
      const matchWithoutVersion = allIds.searchWithoutVersion(componentId);
      if (matchWithoutVersion) return matchWithoutVersion;
    }
    if (this.updatedIds[componentId.toString()]) {
      return this.updatedIds[componentId.toString()].id;
    }
    throw new MissingBitMapComponent(componentId.toString());
  }

  /**
   * get existing bitmap bit-id by bit-id
   * don't throw an exception if not found
   * @see also getBitId
   */
  getComponentIdIfExist(
    componentId: ComponentID,
    {
      ignoreVersion = false,
    }: {
      ignoreVersion?: boolean;
    } = {}
  ): ComponentID | undefined {
    try {
      const existingBitId = this.getComponentId(componentId, { ignoreVersion });
      return existingBitId;
    } catch (err: any) {
      if (err instanceof MissingBitMapComponent) return undefined;
      throw err;
    }
  }

  /**
   * get componentMap from bitmap by bit-id.
   * throw an exception if not found.
   * @see also getComponentIfExist
   */
  getComponent(componentId: ComponentID, { ignoreVersion = false }: GetBitMapComponentOptions = {}): ComponentMap {
    const existingBitId = this.getComponentId(componentId, {
      ignoreVersion,
    });
    return this.components.find((c) => c.id.isEqual(existingBitId)) as ComponentMap;
  }

  /**
   * get componentMap from bitmap by bit-id
   * don't throw an exception if not found
   * @see also getComponent
   */
  getComponentIfExist(
    componentId: ComponentID,
    { ignoreVersion = false }: GetBitMapComponentOptions = {}
  ): ComponentMap | undefined {
    try {
      const componentMap = this.getComponent(componentId, { ignoreVersion });
      return componentMap;
    } catch (err: any) {
      if (err instanceof MissingBitMapComponent) return undefined;
      throw err;
    }
  }

  getAllBitIds(): ComponentIdList {
    return this.getAllIdsAvailableOnLane();
  }

  /**
   * find ids that have the same name but different version
   * if compareWithoutScope is false, the scope should be identical in addition to the name
   */
  private findSimilarIds(id: ComponentID, compareWithoutScope = false): ComponentIdList {
    const allIds = this.getAllBitIdsFromAllLanes();
    // check both, legacy and harmony ids to cover the case where defaultScope is equal to actual scope.
    const isEqual = (idToCheck: ComponentID) => idToCheck._legacy.isEqual(id._legacy) && idToCheck.isEqual(id);
    const similarIds = allIds.filter((existingId) => {
      const isSimilar = compareWithoutScope
        ? existingId.fullName === id.fullName
        : existingId.isEqual(id, { ignoreVersion: true });
      return isSimilar && !isEqual(existingId);
    });
    return ComponentIdList.fromArray(similarIds);
  }

  private deleteOlderVersionsOfComponent(componentId: ComponentID): void {
    const similarIds = this.findSimilarIds(componentId);
    similarIds.forEach((id) => {
      const idStr = id.toString();
      logger.debugAndAddBreadCrumb(
        'BitMap, deleteOlderVersionsOfComponent',
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
  getExistingBitId(id: BitIdStr, shouldThrow = true, searchWithoutScopeInProvidedId = false): ComponentID | undefined {
    if (!R.is(String, id)) {
      throw new TypeError(`BitMap.getExistingBitId expects id to be a string, instead, got ${typeof id}`);
    }

    const allIdsStr = this.getAllIdsStr();
    const allIdsStrWithoutScope = this.getAllIdsStrWithoutScope();
    const allIdsStrWithoutVersion = this.getAllIdsStrWithoutVersion();
    const allIdsStrWithoutScopeAndVersion = this.getAllIdsStrWithoutScopeAndVersion();

    const idHasVersion = id.includes(VERSION_DELIMITER);

    // start with a more strict comparison. assume the id from the user has a scope name
    const componentWithScope = idHasVersion ? allIdsStr[id] : allIdsStrWithoutVersion[id];
    if (componentWithScope) return componentWithScope;
    // continue with searching without the scope name (in the bitmap)
    const idWithoutVersion = ComponentID.getStringWithoutVersion(id);
    const componentWithoutScope = idHasVersion
      ? allIdsStrWithoutScope[id]
      : allIdsStrWithoutScopeAndVersion[idWithoutVersion];
    if (componentWithoutScope) return componentWithoutScope;
    if (searchWithoutScopeInProvidedId) {
      // continue with searching without the scope name (in the provided id)
      const delimiterIndex = id.indexOf('/');
      if (delimiterIndex !== -1) {
        const idWithoutScope = BitId.getScopeAndName(id).name;
        const matchedName = idHasVersion ? allIdsStr[idWithoutScope] : allIdsStrWithoutVersion[idWithoutScope];
        if (matchedName) return matchedName;
        if (this.updatedIds[idWithoutScope]) {
          return this.updatedIds[idWithoutScope].id;
        }
      }
    }

    if (this.updatedIds[id]) {
      return this.updatedIds[id].id;
    }

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
    defaultScope,
    mainFile,
    rootDir,
    onLanesOnly,
    config,
  }: {
    componentId: ComponentID;
    files: ComponentMapFile[];
    defaultScope?: string;
    mainFile: PathLinux;
    rootDir?: PathOsBasedAbsolute | PathOsBasedRelative;
    onLanesOnly?: boolean;
    config?: Config;
  }): ComponentMap {
    const componentIdStr = componentId.toString();
    logger.debug(`BitMap, adding component ${componentIdStr}`);

    if (!componentId.hasScope() && !defaultScope) {
      throw new BitError(`unable to add component ${componentIdStr}, it does not have a scope nor a defaultScope`);
    }
    if (componentId.hasScope() && defaultScope) {
      throw new BitError(`unable to add component ${componentIdStr}, it has both a scope and a defaultScope`);
    }

    const getOrCreateComponentMap = (): ComponentMap => {
      const ignoreVersion = true; // legacy can have two components on .bitmap with different versions
      const componentMap = this.getComponentIfExist(componentId, { ignoreVersion });
      if (componentMap) {
        logger.info(`BitMap, updating an exiting component ${componentMap.id.toString()}`);
        componentMap.files = files;
        if (!this.laneId) {
          // happens when merging from another lane to main and main is empty
          componentMap.isAvailableOnCurrentLane = true;
          componentMap.onLanesOnly = false;
        }
        componentMap.id = componentId;
        return componentMap;
      }
      // if there are older versions, the user is updating an existing component, delete old ones from bit.map
      this.deleteOlderVersionsOfComponent(componentId);
      // @ts-ignore not easy to fix, we can't instantiate ComponentMap with mainFile because we don't have it yet
      const newComponentMap = new ComponentMap({
        files,
      });
      newComponentMap.setMarkAsChangedCb(this.markAsChangedBinded);
      this.setComponent(componentId, newComponentMap);
      return newComponentMap;
    };
    const componentMap = getOrCreateComponentMap();
    componentMap.mainFile = mainFile;
    if (rootDir) {
      componentMap.rootDir = pathNormalizeToLinux(rootDir);
      this.throwForExistingParentDir(componentMap);
    }
    if (onLanesOnly) {
      componentMap.onLanesOnly = onLanesOnly;
    }
    if (defaultScope) {
      componentMap.defaultScope = defaultScope;
    }
    if (config) {
      componentMap.config = config;
    }
    componentMap.isAvailableOnCurrentLane = true;
    this.sortValidateAndMarkAsChanged(componentMap);
    return componentMap;
  }

  addFilesToComponent({ componentId, files }: { componentId: ComponentID; files: ComponentMapFile[] }): ComponentMap {
    const componentIdStr = componentId.toString();
    const componentMap = this.getComponentIfExist(componentId);
    if (!componentMap) {
      throw new BitError(`unable to add files to a non-exist component ${componentIdStr}`);
    }
    logger.info(`BitMap, addFilesToComponent ${componentIdStr}`);
    componentMap.files = files;
    this.sortValidateAndMarkAsChanged(componentMap);
    return componentMap;
  }

  syncWithIds(ids: ComponentIdList, laneBitIds: ComponentIdList) {
    this.components.forEach((componentMap) => {
      componentMap.isAvailableOnCurrentLane = ids.hasWithoutVersion(componentMap.id);
      componentMap.onLanesOnly = laneBitIds.hasWithoutVersion(componentMap.id);
    });
    this._invalidateCache();
    this.markAsChanged();
  }

  sortValidateAndMarkAsChanged(componentMap: ComponentMap) {
    componentMap.sort();
    componentMap.validate();
    this.markAsChanged();
  }

  _invalidateCache = () => {
    this.paths = {};
    this.pathsLowerCase = {};
    this._cacheIdsAll = undefined;
    this._cacheIdsLane = undefined;
    this._cacheIdsLaneIncludeRemoved = undefined;
    this.allTrackDirs = undefined;
    this._cacheIdsAllStr = undefined;
    this._cacheIdsAllStrWithoutScope = undefined;
    this._cacheIdsAllStrWithoutVersion = undefined;
    this._cacheIdsAllStrWithoutScopeAndVersion = undefined;
  };

  private _removeFromComponentsArray(componentId: ComponentID) {
    logger.debug(`BitMap, _removeFromComponentsArray ${componentId.toString()}`);
    this.components = this.components.filter((componentMap) => !componentMap.id.isEqual(componentId));
    this.markAsChanged();
  }

  removeComponent(bitId: ComponentID) {
    const bitmapComponent = this.getComponentIdIfExist(bitId, { ignoreVersion: true });
    if (bitmapComponent) this._removeFromComponentsArray(bitmapComponent);
    return bitmapComponent;
  }
  removeComponents(ids: ComponentID[]) {
    return ids.map((id) => this.removeComponent(id));
  }

  /**
   * needed after exporting or tagging a component.
   * find the older version in bit.map and update the id with the new one.
   */
  updateComponentId(
    id: ComponentID,
    updateScopeOnly = false,
    revertToMain = false,
    updateVersionOnly = false
  ): ComponentID {
    logger.debug(
      `BitMap, updateComponentId ${id.toString()}, updateScopeOnly ${updateScopeOnly.toString()}, updateVersionOnly ${updateVersionOnly.toString()}`
    );
    const newIdString = id.toString();
    const similarBitIds = this.findSimilarIds(id, true);
    if (!similarBitIds.length) {
      logger.debug(`BitMap, no need to update ${newIdString}, no similar ids found`);
      return id;
    }
    const similarCompMaps = similarBitIds.map((similarId) => this.getComponent(similarId));
    const similarIds = similarCompMaps
      .filter(
        (compMap) =>
          (compMap.defaultScope || compMap.id.scope) === id.scope || (!id.hasScope() && !compMap.id.hasScope())
      )
      .map((c) => c.id);
    if (!similarIds.length) {
      logger.debug(
        `BitMap, no need to update ${newIdString}. the similar ids don't have the same scope: ${similarBitIds.join(
          ', '
        )}`
      );
      return id;
    }
    if (similarIds.length > 1) {
      throw new BitError(
        `Your ${BIT_MAP} file has more than one version of ${id.toStringWithoutVersion()}, it should have only one`
      );
    }
    const oldId: ComponentID = similarIds[0];
    const oldIdStr = oldId.toString();
    const getNewId = () => {
      if (updateVersionOnly) return oldId.changeVersion(id.version);
      if (updateScopeOnly) return oldId.changeScope(id.scope);
      return id;
    };
    const newId = getNewId();
    const haveSameDefaultScope = (newId.hasScope() && oldId.hasScope()) || (!newId.hasScope() && !oldId.hasScope());
    if (newId.isEqual(oldId) && haveSameDefaultScope) {
      logger.debug(`BitMap, no need to update ${oldIdStr}, the current id is the same as the new id`);
      return oldId;
    }
    logger.debug(`BitMap: updating an older component ${oldIdStr} with a newer component ${newId.toString()}`);
    const componentMap = this.getComponent(oldId);
    if (this.laneId && !updateScopeOnly && !newId.hasVersion()) {
      // component was un-snapped and is back to "new".
      componentMap.isAvailableOnCurrentLane = true;
      componentMap.onLanesOnly = false;
    }
    if (revertToMain) {
      // happens during "bit remove" when on a lane
      componentMap.isAvailableOnCurrentLane = true;
      componentMap.onLanesOnly = false;
    }
    if (newId.hasScope() && componentMap.defaultScope) {
      // in case it had defaultScope, no need for it anymore.
      delete componentMap.defaultScope;
    }
    this._removeFromComponentsArray(oldId);
    this.setComponent(newId, componentMap);
    this.markAsChanged();
    this.updatedIds[oldIdStr] = componentMap;
    return newId;
  }

  removeConfig(id: ComponentID) {
    const componentMap = this.getComponent(id);
    delete componentMap.config;
    this.markAsChanged();
  }

  /**
   * Return a component id as listed in bit.map file
   * by a path exist in the files object
   *
   * @param {string} componentPath relative to consumer - as stored in bit.map files object
   * @returns {BitId} component id
   * @memberof BitMap
   */
  getComponentIdByPath(componentPath: PathLinux, caseSensitive = true): ComponentID | undefined {
    this._populateAllPaths();
    return caseSensitive ? this.paths[componentPath] : this.pathsLowerCase[componentPath.toLowerCase()];
  }

  _populateAllPaths() {
    if (R.isEmpty(this.paths)) {
      this.components.forEach((component) => {
        component.files.forEach((file) => {
          const relativeToConsumer = component.rootDir
            ? pathJoinLinux(component.rootDir, file.relativePath)
            : file.relativePath;
          this.paths[relativeToConsumer] = component.id;
          this.pathsLowerCase[relativeToConsumer.toLowerCase()] = component.id;
        });
      });
    }
  }

  updateComponentPaths(id: ComponentID, files: PathLinuxRelative[], removedFiles: PathLinuxRelative[]) {
    removedFiles.forEach((removedFile) => {
      delete this.paths[removedFile];
      delete this.pathsLowerCase[removedFile.toLowerCase()];
    });
    files.forEach((file) => {
      this.paths[file] = id;
      this.pathsLowerCase[file.toLowerCase()] = id;
    });
  }

  getAllTrackDirs() {
    if (!this.allTrackDirs) {
      this.allTrackDirs = {};
      this.components.forEach((component) => {
        const trackDir = component.getRootDir();
        if (!trackDir) return;
        // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
        this.allTrackDirs[trackDir] = component.id;
      });
    }
    return this.allTrackDirs;
  }

  updatePathLocation(from: PathOsBasedRelative, to: PathOsBasedRelative): PathChangeResult[] {
    const allChanges: PathChangeResult[] = [];
    this.components.forEach((componentMap) => {
      const changes = componentMap.updateDirLocation(from, to);
      if (changes && changes.length) {
        allChanges.push({ id: componentMap.id.clone(), changes });
        componentMap.noFilesError = undefined;
      }
    });
    if (!allChanges.length) {
      throw new BitError(`directory ${from} is not a tracked component`);
    }

    this.markAsChanged();
    return allChanges;
  }

  /**
   * avoid calling this method directly.
   * prefer `consumer.setCurrentLane()`
   */
  setCurrentLane(laneId: LaneId, exported = true) {
    if (laneId.isDefault()) {
      this.laneId = undefined;
    } else {
      this.laneId = laneId;
      this.isLaneExported = exported;
    }
    this.hasChanged = true;
  }

  /**
   * remove the id property before saving the components to the file as they are redundant with the keys
   */
  toObjects(): Record<string, any> {
    const components = {};
    this.components.forEach((componentMap) => {
      const componentMapCloned = componentMap.clone();
      // no need for "exported" property as there are scope and version props
      // if not exist, we still need these properties so we know later to parse them correctly.
      componentMapCloned.name = componentMapCloned.id.fullName;
      componentMapCloned.scope = componentMapCloned.id.hasScope() ? componentMapCloned.id.scope : '';
      componentMapCloned.version = componentMapCloned.id.hasVersion() ? componentMapCloned.id.version : '';
      if (componentMapCloned.isAvailableOnCurrentLane && !componentMapCloned.onLanesOnly) {
        delete componentMapCloned.isAvailableOnCurrentLane;
      }
      const getKey = (): string => {
        const name = componentMapCloned.id.fullName;
        const similarIds = this.findSimilarIds(componentMapCloned.id, true);
        if (!similarIds.length) return name;
        const scope = componentMapCloned.scope || componentMapCloned.defaultScope;
        if (!scope) throw new Error(`bit-map.toObjects: ${name} has multiple instances but defaultScope is missing`);
        return `${scope}/${name}`;
      };
      const key = getKey();

      // @ts-ignore
      delete componentMapCloned?.id;
      components[key] = componentMapCloned.toPlainObject();
    });

    return sortObjectByKeys(components);
  }

  /**
   * do not call this function directly, let consumer.onDestroy() call it.
   * consumer.onDestroy() is being called (manually) at the end of the command process.
   * the risk of calling this method in other places is a parallel writing of this file, which
   * may result in a damaged file
   */
  async write(): Promise<any> {
    if (!this.hasChanged) return;
    logger.debug('BitMap, writing to .bitmap file');
    await outputFile({ filePath: this.mapPath, content: this.contentToString(), prefixMessage: BITMAP_PREFIX_MESSAGE });
    this.hasChanged = false;
  }

  private contentToString() {
    return JSON.stringify(this.getContent(), null, 4);
  }

  getContent(): Record<string, any> {
    const bitMapContent = { ...this.toObjects(), [SCHEMA_FIELD]: this.schema };
    if (this.laneId) {
      bitMapContent[LANE_KEY] = {
        id: this.laneId,
        exported: this.isLaneExported,
      };
    }
    return bitMapContent;
  }
}

type OutputFileParams = {
  filePath: string;
  content: string;
  writeAutoGeneratedMessage?: boolean;
  override?: boolean;
  prefixMessage?: string;
};

async function outputFile({
  filePath,
  content,
  writeAutoGeneratedMessage = true,
  override = true,
  prefixMessage,
}: OutputFileParams): Promise<string> {
  if (!override && fs.existsSync(filePath)) {
    const fileContent = fs.readFileSync(filePath).toString();
    if (!fileContent.includes(AUTO_GENERATED_STAMP)) return Promise.resolve(filePath);
  }
  let prefix = writeAutoGeneratedMessage ? AUTO_GENERATED_MSG : '';
  prefix = `${prefix}${prefixMessage}`;
  const data = prefix + content;
  await fs.outputFile(filePath, data);
  return Promise.resolve(filePath);
}
