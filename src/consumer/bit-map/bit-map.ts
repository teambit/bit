import json from 'comment-json';
import fs from 'fs-extra';
import * as path from 'path';
import { compact, uniq } from 'lodash';
import R from 'ramda';
import { BitError } from '@teambit/bit-error';
import type { Consumer } from '..';
import { BitId, BitIds } from '../../bit-id';
import { BitIdStr } from '../../bit-id/bit-id';
import { BIT_MAP, COMPONENT_ORIGINS, DEFAULT_LANE, OLD_BIT_MAP, VERSION_DELIMITER } from '../../constants';
import ShowDoctorError from '../../error/show-doctor-error';
import { RemoteLaneId } from '../../lane-id/lane-id';
import logger from '../../logger/logger';
import { isDir, outputFile, pathJoinLinux, pathNormalizeToLinux, sortObject } from '../../utils';
import { PathLinux, PathOsBased, PathOsBasedAbsolute, PathOsBasedRelative, PathRelative } from '../../utils/path';
import { getFilesByDir, getGitIgnoreHarmony } from '../component-ops/add-components/add-components';
import { ComponentFsCache } from '../component/component-fs-cache';
import ComponentMap, { ComponentMapFile, ComponentOrigin, PathChange } from './component-map';
import { InvalidBitMap, MissingBitMapComponent, MultipleMatches } from './exceptions';
import WorkspaceLane from './workspace-lane';
import { getLastModifiedDirTimestampMs, getLastModifiedPathsTimestampMs } from '../../utils/fs/last-modified';
import { DuplicateRootDir } from './exceptions/duplicate-root-dir';

export type PathChangeResult = { id: BitId; changes: PathChange[] };
export type IgnoreFilesDirs = { files: PathLinux[]; dirs: PathLinux[] };
export type GetBitMapComponentOptions = {
  ignoreVersion?: boolean;
  ignoreScopeAndVersion?: boolean;
};

export const LANE_KEY = '_bit_lane';
export const CURRENT_BITMAP_SCHEMA = '14.9.0';
export const SCHEMA_FIELD = '$schema-version';

/**
 * When working on lanes, a component version can be different than the master.
 * For example, when tagging 1.0.0 on master, then switching to a new lane and snapping.
 * The version saved in .bitmap file is the one of master (in this case 1.0.0).
 * The hash of the snap is saved on the 'workspace-lane' file.
 * These files are saved in .bit/workspace/lanes/<lane-name> directory, and they're not get
 * synched by Git.
 * Once a lane is exported to a remote scope, then .bitmap gets a new property
 * "lanes" array that includes the remote-lane-id and the version hash.
 * Still, the version on the ID doesn't get changed and it reflects the master version.
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

  constructor(
    public projectRoot: string,
    private mapPath: string,
    public schema: string,
    private isLegacy: boolean,
    public workspaceLane: WorkspaceLane | null,
    private remoteLaneName?: RemoteLaneId
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
    if (!this.isLegacy) {
      // for Harmony, there is no different between AUTHORED and IMPORTED. and NESTED are not saved
      // in the .bitmap file.
      componentMap.origin = COMPONENT_ORIGINS.AUTHORED;
    }
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
    const scopePath: string = consumer.scope.path;
    const isLegacy = consumer.isLegacy;
    const laneName = consumer.scope.lanes.getCurrentLaneName();
    const { currentLocation, defaultLocation } = BitMap.getBitMapLocation(dirPath);
    const mapFileContent = BitMap.loadRawSync(dirPath);
    const workspaceLane = laneName && laneName !== DEFAULT_LANE ? WorkspaceLane.load(laneName, scopePath) : null;
    if (!mapFileContent || !currentLocation) {
      return new BitMap(dirPath, defaultLocation, CURRENT_BITMAP_SCHEMA, isLegacy, workspaceLane);
    }
    let componentsJson;
    try {
      componentsJson = json.parse(mapFileContent.toString('utf8'), undefined, true);
    } catch (e) {
      logger.error(`invalid bitmap at ${currentLocation}`, e);
      throw new InvalidBitMap(currentLocation, e.message);
    }
    const schema = componentsJson[SCHEMA_FIELD] || componentsJson.version;
    const remoteLaneName = componentsJson[LANE_KEY];

    BitMap.removeNonComponentFields(componentsJson);

    const bitMap = new BitMap(dirPath, currentLocation, schema, isLegacy, workspaceLane, remoteLaneName);
    bitMap.loadComponents(componentsJson);
    await bitMap.loadFiles(consumer.componentFsCache);
    return bitMap;
  }

  static removeNonComponentFields(componentsJson: Record<string, any>) {
    // Don't treat version like component
    componentsJson[SCHEMA_FIELD] ? delete componentsJson[SCHEMA_FIELD] : delete componentsJson.version;
    delete componentsJson[LANE_KEY];
  }

  async loadFiles(componentFsCache: ComponentFsCache) {
    if (this.isLegacy) return;
    const gitIgnore = getGitIgnoreHarmony(this.projectRoot);
    const { currentLocation } = BitMap.getBitMapLocation(this.projectRoot);
    // .bitmap might changed manually and will be very confused for the end user
    // as to why the files look the way they look.
    // similar with .gitignore, if changed, some files may need to be removed/added
    const impactFilesChanged = await getLastModifiedPathsTimestampMs([currentLocation as string, '.gitignore']);
    await Promise.all(
      this.components.map(async (componentMap) => {
        const idStr = componentMap.id.toString();
        const rootDir = componentMap.rootDir;
        if (!rootDir) return;
        const dataFromCache = await componentFsCache.getFilePathsFromCache(idStr);
        if (dataFromCache) {
          const lastModified = await getLastModifiedDirTimestampMs(rootDir);
          const wasModifiedAfterLastTrack = lastModified > dataFromCache.timestamp;
          const wereImpactFilesModifiedAfterLastTrack = impactFilesChanged > dataFromCache.timestamp;
          if (!wasModifiedAfterLastTrack && !wereImpactFilesModifiedAfterLastTrack) {
            const files = JSON.parse(dataFromCache.data);
            componentMap.files = files;
            return;
          }
        }
        try {
          componentMap.files = await getFilesByDir(rootDir, this.projectRoot, gitIgnore);
          componentMap.recentlyTracked = true;
        } catch (err) {
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
    } catch (err) {
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
          trackDir: component.trackDir,
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
      if (!this.isLegacy) {
        componentFromJson.origin = COMPONENT_ORIGINS.AUTHORED;
      }

      const bitId = BitMap.getBitIdFromComponentJson(componentId, componentFromJson, this.isLegacy);
      if (bitId.hasScope() && !bitId.hasVersion() && !componentFromJson.lanes) {
        throw new BitError(
          `.bitmap entry of "${componentId}" is invalid, it has a scope-name "${bitId.scope}", however, it does not have any version`
        );
      }
      componentFromJson.id = bitId;
      const componentMap = ComponentMap.fromJson(componentFromJson);
      componentMap.updatePerLane(this.remoteLaneName, this.workspaceLane ? this.workspaceLane.ids : null);
      componentMap.setMarkAsChangedCb(this.markAsChangedBinded);
      this.components.push(componentMap);
    });
  }

  static getBitIdFromComponentJson(
    componentId: string,
    componentFromJson: Record<string, any>,
    isLegacy = false
  ): BitId {
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
      if (isLegacy) {
        // backward compatibility
        return BitId.parseObsolete(componentId).hasScope();
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
      const allComponents = this.components.filter((c) => c.isAvailableOnCurrentLane);
      const components = oneOrigin ? allComponents.filter((c) => c.origin === oneOrigin) : allComponents;
      const componentIds = ids(components);
      this._cacheIds[cacheKey] = componentIds;
      return componentIds;
    };

    if (!origin) return getIdsOfOrigin();
    return BitIds.fromArray(R.flatten(origin.map((oneOrigin) => getIdsOfOrigin(oneOrigin))));
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
      ignoreScopeAndVersion = false,
    }: {
      ignoreVersion?: boolean;
      ignoreScopeAndVersion?: boolean;
    } = {}
  ): BitId {
    if (!(bitId instanceof BitId)) {
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
    { ignoreVersion = false, ignoreScopeAndVersion = false }: GetBitMapComponentOptions = {}
  ): ComponentMap {
    const existingBitId: BitId = this.getBitId(bitId, { ignoreVersion, ignoreScopeAndVersion });
    return this.components.find((c) => c.id.isEqual(existingBitId)) as ComponentMap;
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
      ignoreScopeAndVersion = false,
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

  getAuthoredAndImportedBitIdsOfDefaultLane(): BitIds {
    const all = this.getAuthoredAndImportedBitIds();
    const filteredWithDefaultVersion = all
      .map((id) => {
        const componentMap = this.getComponent(id);
        if (componentMap.onLanesOnly) return null;
        return componentMap.id.changeVersion(componentMap.defaultVersion || componentMap.id.version);
      })
      .filter((x) => x);
    return BitIds.fromArray(filteredWithDefaultVersion as BitId[]);
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
      }
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
    mainFile,
    origin,
    rootDir,
    trackDir,
    originallySharedDir,
    wrapDir,
    onLanesOnly,
  }: {
    componentId: BitId;
    files: ComponentMapFile[];
    mainFile: PathLinux;
    origin: ComponentOrigin;
    rootDir?: PathOsBasedAbsolute | PathOsBasedRelative;
    trackDir?: PathOsBased;
    originallySharedDir?: PathLinux;
    wrapDir?: PathLinux;
    onLanesOnly?: boolean;
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
    if (onLanesOnly) {
      componentMap.onLanesOnly = onLanesOnly;
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

  reLoadAfterSwitchingLane(workspaceLane: null | WorkspaceLane) {
    this.workspaceLane = workspaceLane;
    this._invalidateCache();
    this.components.forEach((componentMap) =>
      componentMap.updatePerLane(this.remoteLaneName, this.workspaceLane ? this.workspaceLane.ids : null)
    );
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
    if (this.workspaceLane && !updateScopeOnly) {
      // this code is executed when snapping/tagging and user is on a lane.
      // change the version only on the lane, not on .bitmap
      this.workspaceLane.addEntry(newId);
      componentMap.defaultVersion = componentMap.defaultVersion || oldId.version;
    }
    this._removeFromComponentsArray(oldId);
    this.setComponent(newId, componentMap);
    this.markAsChanged();
    return newId;
  }

  updateLanesProperty(workspaceLane: WorkspaceLane, remoteLaneId: RemoteLaneId) {
    workspaceLane.ids.forEach((bitIdOnLane) => {
      // we ignore version but we do require the scope to be the same because if the scope is
      // empty, the lane is going to populate the id itself, so no need to replicate it in the
      // lanes prop
      const componentMap = this.getComponentIfExist(bitIdOnLane, { ignoreVersion: true });
      if (!componentMap) return; // a user might export components that are not in .bitmap
      if (!componentMap.defaultVersion || componentMap.defaultVersion === componentMap.id.version) {
        // if no defaultVersion the current version (id.version) is the only version so no need
        // to save this version again in lanes prop.
        return;
      }
      componentMap.addLane(remoteLaneId, bitIdOnLane.version as string);
    });
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

  setRemoteLane(remoteLane: RemoteLaneId) {
    this.remoteLaneName = remoteLane;
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
      if (this.isLegacy) {
        if (componentMapCloned.origin === COMPONENT_ORIGINS.AUTHORED) {
          componentMapCloned.exported = componentMapCloned.id.hasScope();
        }
      } else {
        // no need for "exported" property as there are scope and version props
        // if not exist, we still need these properties so we know later to parse them correctly.
        componentMapCloned.scope = componentMapCloned.id.hasScope() ? componentMapCloned.id.scope : '';
        componentMapCloned.version = componentMapCloned.id.hasVersion() ? componentMapCloned.id.version : '';
        // change back the id to the master id, so the local lanes data won't be saved in .bitmap
        if (componentMapCloned.defaultVersion) {
          componentMapCloned.version = componentMapCloned.defaultVersion;
        }
        idStr = componentMapCloned.id.name;
      }
      // @ts-ignore
      delete componentMapCloned?.id;
      components[idStr] = componentMapCloned.toPlainObject(this.isLegacy);
    });

    return sortObject(components);
  }

  /**
   * do not call this function directly, let consumer.onDestroy() call it.
   * consumer.onDestroy() is being called (manually) at the end of the command process.
   * the risk of calling this method in other places is a parallel writing of this file, which
   * may result in a damaged file
   */
  async write(componentFsCache: ComponentFsCache): Promise<any> {
    await Promise.all(
      this.components.map(async (c) => {
        if (c.recentlyTracked) {
          await componentFsCache.setLastTrackTimestamp(c.id.toString(), Date.now());
          if (!this.isLegacy) {
            await componentFsCache.saveFilePathsInCache(c.id.toString(), c.files);
          }
        }
      })
    );
    if (!this.hasChanged) return;
    logger.debug('writing to bit.map');
    if (this.workspaceLane) await this.workspaceLane.write();
    await outputFile({ filePath: this.mapPath, content: this.contentToString() });
    this.hasChanged = false;
  }

  private contentToString() {
    return JSON.stringify(this.getContent(), null, 4);
  }

  getContent(): Record<string, any> {
    const bitMapContent = { ...this.toObjects(), [SCHEMA_FIELD]: this.schema };
    if (this.remoteLaneName) {
      bitMapContent[LANE_KEY] = this.remoteLaneName;
    }
    return bitMapContent;
  }
}
