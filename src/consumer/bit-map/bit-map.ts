import json from 'comment-json';
import fs from 'fs-extra';
import * as path from 'path';
import { compact, uniq } from 'lodash';
import R from 'ramda';
import { LaneId } from '@teambit/lane-id';
import { BitError } from '@teambit/bit-error';
import type { Consumer } from '..';
import { BitId, BitIds } from '../../bit-id';
import { BitIdStr } from '../../bit-id/bit-id';
import { BIT_MAP, COMPONENT_ORIGINS, OLD_BIT_MAP, VERSION_DELIMITER, BITMAP_PREFIX_MESSAGE } from '../../constants';
import ShowDoctorError from '../../error/show-doctor-error';
import logger from '../../logger/logger';
import { isDir, outputFile, pathJoinLinux, pathNormalizeToLinux, sortObject } from '../../utils';
import { PathLinux, PathOsBased, PathOsBasedAbsolute, PathOsBasedRelative, PathRelative } from '../../utils/path';
import { getFilesByDir, getGitIgnoreHarmony } from '../component-ops/add-components/add-components';
import ComponentMap, { ComponentMapFile, ComponentOrigin, Config, PathChange } from './component-map';
import { InvalidBitMap, MissingBitMapComponent, MultipleMatches } from './exceptions';
import { DuplicateRootDir } from './exceptions/duplicate-root-dir';
import GeneralError from '../../error/general-error';
import { Lane } from '../../scope/models';

export type PathChangeResult = { id: BitId; changes: PathChange[] };
export type IgnoreFilesDirs = { files: PathLinux[]; dirs: PathLinux[] };
export type GetBitMapComponentOptions = {
  ignoreVersion?: boolean;
  ignoreScopeAndVersion?: boolean;
};

export const LANE_KEY = '_bit_lane';
export const CURRENT_BITMAP_SCHEMA = '15.0.0';
export const SCHEMA_FIELD = '$schema-version';

/**
 * When working on lanes, a component version can be different than the main.
 * For example, when tagging 1.0.0 on main, then switching to a new lane and snapping.
 * The version saved in .bitmap file is the one of main (in this case 1.0.0).
 * The hash of the snap is saved on the 'workspace-lane' file.
 * These files are saved in .bit/workspace/lanes/<lane-name> directory, and they're not get
 * synched by Git.
 * Once a lane is exported to a remote scope, then .bitmap gets a new property
 * "lanes" array that includes the remote-lane-id and the version hash.
 * Still, the version on the ID doesn't get changed and it reflects the main version.
 * Since all operations on .bitmap are not aware of this new workspace-lane file and the "lanes" prop,
 * we do a manipulation when loading and when saving the .bitmap file.
 * When loading .bitmap file, it also loads the workspace-lane of the active lane if exists.
 * In case a bit-id has a different version on the workspace lane file, the version is changed
 * to the lane version and the old version is saved into a prop "defaultVersion".
 * This way, all methods that interact with .bitmap gets the correct version.
 * Once .bitmap is saved, the "version" is related by the "defaultVersion" if exists.
 */
export default class BitMap {
  components: ComponentMap[];
  hasChanged: boolean;
  paths: { [path: string]: BitId }; // path => componentId
  pathsLowerCase: { [path: string]: BitId }; // path => componentId
  markAsChangedBinded: Function;
  _cacheIds: { [origin: string]: BitIds | undefined };
  allTrackDirs: { [trackDir: string]: BitId } | null | undefined;
  private updatedIds: { [oldIdStr: string]: ComponentMap } = {}; // needed for out-of-sync where the id is changed during the process
  constructor(
    public projectRoot: string,
    public mapPath: string,
    public schema: string,
    public laneId?: LaneId,
    public isLaneExported = false
  ) {
    this.components = [];
    this.hasChanged = false;
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
    // for Harmony, there is no different between AUTHORED and IMPORTED. and NESTED are not saved
    // in the .bitmap file.
    componentMap.origin = COMPONENT_ORIGINS.AUTHORED;
    const id = bitId.toString();
    if (!bitId.hasVersion() && bitId.scope) {
      throw new ShowDoctorError(
        `invalid bitmap id ${id}, a component must have a version when a scope-name is included`
      );
    }
    // make sure there are no duplications (same name)
    const similarIds = this.findSimilarIds(bitId, true);
    if (similarIds.length) {
      throw new ShowDoctorError(`your id ${id} is duplicated with ${similarIds.toString()}`);
    }
    componentMap.id = bitId;
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
        throw new GeneralError(
          `unable to add "${id.toString()}", its rootDir ${rootDir} is inside ${
            existingComponentMap.rootDir
          } which used by another component "${existingComponentMap.id.toString()}"`
        );
      }
      if (isParentDir(rootDir, existingComponentMap.rootDir)) {
        throw new GeneralError(
          `unable to add "${id.toString()}", its rootDir ${rootDir} is used by another component ${existingComponentMap.id.toString()}`
        );
      }
    });
  }

  setComponentProp(id: BitId, propName: keyof ComponentMap, val: any) {
    const componentMap = this.getComponent(id, { ignoreScopeAndVersion: true });
    (componentMap as any)[propName] = val;
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

  static async load(consumer: Consumer): Promise<BitMap> {
    const dirPath: PathOsBasedAbsolute = consumer.getPath();
    const { currentLocation, defaultLocation } = BitMap.getBitMapLocation(dirPath);
    const mapFileContent = BitMap.loadRawSync(dirPath);
    if (!mapFileContent || !currentLocation) {
      return new BitMap(dirPath, defaultLocation, CURRENT_BITMAP_SCHEMA);
    }
    let componentsJson;
    try {
      componentsJson = json.parse(mapFileContent.toString('utf8'), undefined, true);
    } catch (e: any) {
      logger.error(`invalid bitmap at ${currentLocation}`, e);
      throw new InvalidBitMap(currentLocation, e.message);
    }
    const schema = componentsJson[SCHEMA_FIELD] || componentsJson.version;
    let isLaneExported = false;
    let laneId: LaneId | undefined;
    let shouldHandleLanesBackwardCompatibility = false;
    if (componentsJson[LANE_KEY]) {
      if (componentsJson[LANE_KEY].name) {
        // backward compatibility
        laneId = new LaneId(componentsJson[LANE_KEY]);
        isLaneExported = true;
        shouldHandleLanesBackwardCompatibility = true;
      } else {
        laneId = new LaneId(componentsJson[LANE_KEY].id);
        isLaneExported = componentsJson[LANE_KEY].exported;
      }
    }
    const currentLaneId = consumer.getCurrentLaneId();
    if (laneId && currentLaneId.isDefault()) {
      logger.console(
        `workspace is auto-synced to "${laneId.toString()}" lane, please run "bit import" to obtain the missing objects`,
        'warn',
        'yellow'
      );
      const scopeJson = consumer.scope.scopeJson;
      scopeJson.trackLane({
        remoteLane: laneId.name,
        remoteScope: laneId.scope,
        localLane: laneId.name,
      });
      scopeJson.setCurrentLane(laneId.name);
    }

    BitMap.removeNonComponentFields(componentsJson);

    const bitMap = new BitMap(dirPath, currentLocation, schema, laneId, isLaneExported);
    bitMap.loadComponents(componentsJson);

    // @todo: remove this if statement once we don't need the migration of the bitmap file for lanes
    if (shouldHandleLanesBackwardCompatibility) {
      if (!laneId) throw new Error(`laneId must be set if shouldHandleLanesBackwardCompatibility is true`);
      if (!currentLaneId.isEqual(laneId)) {
        throw new Error(
          `unable to migrate lanes on .bitmap, the current lane ${currentLaneId.toString()} is not exported. go to an older version of bit and export the lane first.`
        );
      }
      const lane = await consumer.scope.loadLane(laneId as LaneId);
      if (!lane)
        throw new Error(
          `unable to migrate lanes on .bitmap, the lane of ${laneId?.toString()} is not found. go to an older version, and run "bit import"`
        );
      const laneIds = lane.toBitIds();
      bitMap.components.forEach((componentMap) => {
        const idOnLane = laneIds.searchWithoutVersion(componentMap.id);
        if (idOnLane) {
          componentMap.id = componentMap.id.changeVersion(idOnLane.version as string);
        }
      });
    }

    await bitMap.loadFiles();
    return bitMap;
  }

  static removeNonComponentFields(componentsJson: Record<string, any>) {
    // Don't treat version like component
    componentsJson[SCHEMA_FIELD] ? delete componentsJson[SCHEMA_FIELD] : delete componentsJson.version;
    delete componentsJson[LANE_KEY];
  }

  async loadFiles() {
    const gitIgnore = getGitIgnoreHarmony(this.projectRoot);
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
      // @todo: delete workspace lanes as well? maybe they're already taken care of within scope.reset
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
    this.components = this.components.map(
      (component) =>
        new ComponentMap({
          id: component.id.changeVersion(undefined).changeScope(undefined),
          mainFile: component.mainFile,
          rootDir: component.rootDir,
          exported: false,
          files: component.files,
          origin: COMPONENT_ORIGINS.AUTHORED,
          onLanesOnly: false,
        })
    );
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

  loadComponents(componentsJson: Record<string, any>) {
    this.throwForDuplicateRootDirs(componentsJson);
    Object.keys(componentsJson).forEach((componentId) => {
      const componentFromJson = componentsJson[componentId];
      componentFromJson.origin = COMPONENT_ORIGINS.AUTHORED;
      const bitId = BitMap.getBitIdFromComponentJson(componentId, componentFromJson);
      if (bitId.hasScope() && !bitId.hasVersion()) {
        throw new BitError(
          `.bitmap entry of "${componentId}" is invalid, it has a scope-name "${bitId.scope}", however, it does not have any version`
        );
      }
      componentFromJson.id = bitId;
      const componentMap = ComponentMap.fromJson(componentFromJson);
      componentMap.setMarkAsChangedCb(this.markAsChangedBinded);
      this.components.push(componentMap);
    });
  }

  static getBitIdFromComponentJson(componentId: string, componentFromJson: Record<string, any>): BitId {
    // on Harmony, to parse the id, the old format used "exported" prop, the current format
    // uses "scope" and "version" props.
    const newHarmonyFormat = 'scope' in componentFromJson;
    if (newHarmonyFormat) {
      const bitId = new BitId({
        scope: componentFromJson.scope,
        name: componentId,
        version: componentFromJson.version,
      });
      // it needs to be parsed for 1) validation 2) adding "latest" to the version if needed.
      return BitId.parse(bitId.toString(), bitId.hasScope());
    }
    const idHasScope = (): boolean => {
      if (componentFromJson.origin && componentFromJson.origin !== COMPONENT_ORIGINS.AUTHORED) return true;
      if ('exported' in componentFromJson) {
        if (typeof componentFromJson.exported !== 'boolean') {
          throw new BitError(
            `fatal: .bitmap record of "${componentId}" is invalid, the exported property must be boolean, got "${typeof componentFromJson.exported}" instead.`
          );
        }
        return componentFromJson.exported;
      }
      // on Harmony, if there is no "exported" we default to "true" as this is the most commonly
      // used. so it's better to have as little as possible of these props.
      componentFromJson.exported = true;
      return true;
    };
    return BitId.parse(componentId, idHasScope());
  }

  getAllComponents(origin?: ComponentOrigin | ComponentOrigin[]): ComponentMap[] {
    if (!origin) return this.components;
    const isOriginMatch = (component) => component.origin === origin;
    // $FlowFixMe we know origin is an array in that case
    const isOriginMatchArray = (component) => origin.includes(component.origin);
    const filter = Array.isArray(origin) ? isOriginMatchArray : isOriginMatch;
    return R.filter(filter, this.components);
  }

  /**
   * important! you probably want to use "getAllIdsAvailableOnLane".
   * this method returns ids that are not available on the current lane and will throw errors when
   * trying to load them.
   */
  getAllBitIdsFromAllLanes(origin?: ComponentOrigin[]): BitIds {
    const ids = (componentMaps: ComponentMap[]) => BitIds.fromArray(componentMaps.map((c) => c.id));
    const getIdsOfOrigin = (oneOrigin?: ComponentOrigin): BitIds => {
      const cacheKey = oneOrigin || 'all';
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      if (this._cacheIds[cacheKey]) return this._cacheIds[cacheKey];
      const allComponents = this.components;
      const components = oneOrigin ? allComponents.filter((c) => c.origin === oneOrigin) : allComponents;
      const componentIds = ids(components);
      this._cacheIds[cacheKey] = componentIds;
      return componentIds;
    };

    if (!origin) return getIdsOfOrigin();
    return BitIds.fromArray(R.flatten(origin.map((oneOrigin) => getIdsOfOrigin(oneOrigin))));
  }

  getAllIdsAvailableOnLane(origin?: ComponentOrigin[]): BitIds {
    const ids = (componentMaps: ComponentMap[]) => BitIds.fromArray(componentMaps.map((c) => c.id));
    const getIdsOfOrigin = (oneOrigin?: ComponentOrigin): BitIds => {
      const cacheKey = `lane-${oneOrigin}` || 'lane-all';
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      if (this._cacheIds[cacheKey]) return this._cacheIds[cacheKey];
      const allComponents = this.components.filter((c) => c.isAvailableOnCurrentLane || !c.onLanesOnly);
      const components = oneOrigin ? allComponents.filter((c) => c.origin === oneOrigin) : allComponents;
      const componentIds = ids(components);
      this._cacheIds[cacheKey] = componentIds;
      return componentIds;
    };

    if (!origin) return getIdsOfOrigin();
    return BitIds.fromArray(R.flatten(origin.map((oneOrigin) => getIdsOfOrigin(oneOrigin))));
  }

  isIdAvailableOnCurrentLane(id: BitId): boolean {
    const allIdsOfCurrentLane = this.getAllIdsAvailableOnLane();
    return allIdsOfCurrentLane.hasWithoutScopeAndVersion(id);
  }

  /**
   * get existing bitmap bit-id by bit-id.
   * throw an exception if not found
   * @see also getBitIdIfExist
   */
  getBitId(
    bitId: BitId,
    { ignoreVersion = false, ignoreScopeAndVersion = false }: GetBitMapComponentOptions = {}
  ): BitId {
    if (bitId.constructor.name !== BitId.name) {
      throw new TypeError(`BitMap.getBitId expects bitId to be an instance of BitId, instead, got ${bitId}`);
    }
    const allIds = this.getAllBitIdsFromAllLanes();
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
    if (this.updatedIds[bitId.toString()]) {
      return this.updatedIds[bitId.toString()].id;
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
      ignoreScopeAndVersion = false,
    }: {
      ignoreVersion?: boolean;
      ignoreScopeAndVersion?: boolean;
    } = {}
  ): BitId | undefined {
    try {
      const existingBitId = this.getBitId(bitId, { ignoreVersion, ignoreScopeAndVersion });
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
  getComponent(
    bitId: BitId,
    { ignoreVersion = false, ignoreScopeAndVersion = false }: GetBitMapComponentOptions = {}
  ): ComponentMap {
    const existingBitId: BitId = this.getBitId(bitId, {
      ignoreVersion,
      ignoreScopeAndVersion,
    });
    return this.components.find((c) => c.id.isEqual(existingBitId)) as ComponentMap;
  }

  /**
   * get componentMap from bitmap by bit-id
   * don't throw an exception if not found
   * @see also getComponent
   */
  getComponentIfExist(
    bitId: BitId,
    { ignoreVersion = false, ignoreScopeAndVersion = false }: GetBitMapComponentOptions = {}
  ): ComponentMap | undefined {
    try {
      const componentMap = this.getComponent(bitId, { ignoreVersion, ignoreScopeAndVersion });
      return componentMap;
    } catch (err: any) {
      if (err instanceof MissingBitMapComponent) return undefined;
      throw err;
    }
  }

  getNonNestedComponentIfExist(bitId: BitId): ComponentMap | undefined {
    const nonNestedIds = this.getAllBitIdsFromAllLanes([COMPONENT_ORIGINS.IMPORTED, COMPONENT_ORIGINS.AUTHORED]);
    const id: BitId | undefined = nonNestedIds.searchWithoutScopeAndVersion(bitId);
    if (!id) return undefined;
    return this.getComponent(id);
  }

  getComponentPreferNonNested(bitId: BitId): ComponentMap | undefined {
    return this.getNonNestedComponentIfExist(bitId) || this.getComponentIfExist(bitId, { ignoreVersion: true });
  }

  getAuthoredAndImportedBitIds(): BitIds {
    return this.getAllIdsAvailableOnLane([COMPONENT_ORIGINS.AUTHORED, COMPONENT_ORIGINS.IMPORTED]);
  }

  /**
   * warning! don't use this function. the versions you'll get are not necessarily belong to main.
   * instead, use `consumer.getIdsOfDefaultLane()`
   */
  getAuthoredAndImportedBitIdsOfDefaultLane(): BitIds {
    const all = this.getAuthoredAndImportedBitIds();
    const filteredWithDefaultVersion = all.map((id) => {
      const componentMap = this.getComponent(id);
      if (componentMap.onLanesOnly) return null;
      return componentMap.id;
    });
    return BitIds.fromArray(compact(filteredWithDefaultVersion));
  }

  getAuthoredExportedComponents(): BitId[] {
    const authoredIds = this.getAllIdsAvailableOnLane([COMPONENT_ORIGINS.AUTHORED]);
    return authoredIds.filter((id) => id.hasScope());
  }
  getAuthoredNonExportedComponents(): BitId[] {
    const authoredIds = this.getAllIdsAvailableOnLane([COMPONENT_ORIGINS.AUTHORED]);
    return authoredIds.filter((id) => !id.hasScope());
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
    const allIds = this.getAllBitIdsFromAllLanes([COMPONENT_ORIGINS.IMPORTED, COMPONENT_ORIGINS.AUTHORED]);
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
    similarIds.forEach((id) => {
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
  getExistingBitId(id: BitIdStr, shouldThrow = true, searchWithoutScopeInProvidedId = false): BitId | undefined {
    if (!R.is(String, id)) {
      throw new TypeError(`BitMap.getExistingBitId expects id to be a string, instead, got ${typeof id}`);
    }
    const idHasVersion = id.includes(VERSION_DELIMITER);

    // start with a more strict comparison. assume the id from the user has a scope name
    const componentWithScope = this.components.find((componentMap: ComponentMap) => {
      return idHasVersion ? componentMap.id.toString() === id : componentMap.id.toStringWithoutVersion() === id;
    });
    if (componentWithScope) return componentWithScope.id;

    // continue with searching without the scope name (in the bitmap)
    const idWithoutVersion = BitId.getStringWithoutVersion(id);
    const componentWithoutScope = this.components.find((componentMap: ComponentMap) => {
      return idHasVersion
        ? componentMap.id.toStringWithoutScope() === id
        : componentMap.id.toStringWithoutScopeAndVersion() === idWithoutVersion;
    });
    if (componentWithoutScope) return componentWithoutScope.id;

    if (searchWithoutScopeInProvidedId) {
      // continue with searching without the scope name (in the provided id)
      const delimiterIndex = id.indexOf('/');
      if (delimiterIndex !== -1) {
        const idWithoutScope = BitId.getScopeAndName(id).name;
        const matches = this.components.filter((componentMap: ComponentMap) => {
          return idHasVersion
            ? componentMap.id.toString() === idWithoutScope
            : componentMap.id.toStringWithoutVersion() === idWithoutScope;
        });
        if (matches && matches.length > 1) {
          throw new MultipleMatches(id);
        }
        if (matches && matches.length === 1) {
          return matches[0].id;
        }
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
    origin,
    rootDir,
    onLanesOnly,
    config,
  }: {
    componentId: BitId;
    files: ComponentMapFile[];
    defaultScope?: string;
    mainFile: PathLinux;
    origin: ComponentOrigin;
    rootDir?: PathOsBasedAbsolute | PathOsBasedRelative;
    onLanesOnly?: boolean;
    config?: Config;
  }): ComponentMap {
    const componentIdStr = componentId.toString();
    logger.debug(`adding to bit.map ${componentIdStr}`);

    const getOrCreateComponentMap = (): ComponentMap => {
      const ignoreVersion = true; // legacy can have two components on .bitmap with different versions
      const componentMap = this.getComponentIfExist(componentId, { ignoreVersion });
      if (componentMap) {
        logger.info(`bit.map: updating an exiting component ${componentMap.id.toString()}`);
        componentMap.files = files;
        if (!this.laneId && componentMap.onLanesOnly) {
          // happens when merging from another lane to main and main is empty
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
        origin,
        onLanesOnly: Boolean(this.laneId) && componentId.hasVersion(),
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

  syncWithLanes(lane?: Lane) {
    if (!lane) {
      this.laneId = undefined;
      this.isLaneExported = false;
      this.components.forEach((componentMap) => {
        componentMap.isAvailableOnCurrentLane = !componentMap.onLanesOnly;
      });
    } else {
      this.laneId = lane.toLaneId();
      const laneIds = lane.toBitIds();
      this.components.forEach((componentMap) => {
        componentMap.isAvailableOnCurrentLane = laneIds.hasWithoutVersion(componentMap.id) || !componentMap.onLanesOnly;
      });
    }
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
    this._cacheIds = {};
    this.allTrackDirs = undefined;
  };

  _removeFromComponentsArray(componentId: BitId) {
    logger.debug(`bit-map: _removeFromComponentsArray ${componentId.toString()}`);
    this.components = this.components.filter((componentMap) => !componentMap.id.isEqual(componentId));
    this.markAsChanged();
  }

  removeComponent(bitId: BitId) {
    const bitmapComponent = this.getBitIdIfExist(bitId, { ignoreScopeAndVersion: true });
    if (bitmapComponent) this._removeFromComponentsArray(bitmapComponent);
    return bitmapComponent;
  }
  removeComponents(ids: BitIds) {
    return ids.map((id) => this.removeComponent(id));
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
  updateComponentId(id: BitId, updateScopeOnly = false, revertToMain = false): BitId {
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
    if (this.laneId && !updateScopeOnly && !newId.hasVersion()) {
      // component was un-snapped and is back to "new".
      componentMap.onLanesOnly = false;
    }
    if (revertToMain) {
      // happens during "bit remove" when on a lane
      componentMap.onLanesOnly = false;
    }
    if (updateScopeOnly) {
      // in case it had defaultScope, no need for it anymore.
      delete componentMap.defaultScope;
    }
    this._removeFromComponentsArray(oldId);
    this.setComponent(newId, componentMap);
    this.markAsChanged();
    this.updatedIds[oldIdStr] = componentMap;
    return newId;
  }

  removeConfig(id: BitId) {
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
  getComponentIdByPath(componentPath: PathLinux, caseSensitive = true): BitId {
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

  updatePathLocation(
    from: PathOsBasedRelative,
    to: PathOsBasedRelative,
    existingPath: PathOsBasedAbsolute
  ): PathChangeResult[] {
    const isPathDir = isDir(existingPath);
    const allChanges = [];
    this.components.forEach((componentMap) => {
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
      let idStr = componentMapCloned.id.toString();
      // no need for "exported" property as there are scope and version props
      // if not exist, we still need these properties so we know later to parse them correctly.
      componentMapCloned.scope = componentMapCloned.id.hasScope() ? componentMapCloned.id.scope : '';
      componentMapCloned.version = componentMapCloned.id.hasVersion() ? componentMapCloned.id.version : '';
      idStr = componentMapCloned.id.name;
      // @ts-ignore
      delete componentMapCloned?.id;
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
    if (!this.hasChanged) return;
    logger.debug('writing to bit.map');
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
