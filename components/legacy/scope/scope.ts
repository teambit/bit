import fs from 'fs-extra';
import * as pathLib from 'path';
import { ComponentID, ComponentIdList } from '@teambit/component-id';
import { DEPS_GRAPH, isFeatureEnabled } from '@teambit/harmony.modules.feature-toggle';
import R from 'ramda';
import { BitId, BitIdStr } from '@teambit/legacy-bit-id';
import { LaneId } from '@teambit/lane-id';
import semver from 'semver';
import { BitError } from '@teambit/bit-error';
import { findScopePath } from '@teambit/scope.modules.find-scope-path';
import { isTag } from '@teambit/component-version';
import { readDirIgnoreSystemFilesSync } from '@teambit/toolbox.fs.readdir-skip-system-files';
import { Analytics } from '@teambit/legacy.analytics';
import {
  BIT_GIT_DIR,
  BIT_HIDDEN_DIR,
  BITS_DIRNAME,
  CURRENT_UPSTREAM,
  DEFAULT_BIT_VERSION,
  DOT_GIT_DIR,
  LATEST,
  OBJECTS_DIR,
  SCOPE_JSON,
  PENDING_OBJECTS_DIR,
} from '@teambit/legacy.constants';
import { ConsumerComponent as Component } from '@teambit/legacy.consumer-component';
import { ExtensionDataEntry } from '@teambit/legacy.extension-data';
import { Consumer, UnexpectedPackageName } from '@teambit/legacy.consumer';
import { logger } from '@teambit/legacy.logger';
import { PathOsBasedAbsolute } from '@teambit/legacy.utils';
import RemoveModelComponents from './component-ops/remove-model-components';
import { ScopeComponentsImporter } from './component-ops/scope-components-importer';
import { ComponentVersion } from './component-version';
import { ComponentNotFound, ScopeNotFound } from './exceptions';
import { DependencyGraph } from '@teambit/legacy.dependency-graph';
import Lanes from './lanes/lanes';
import {
  ModelComponent,
  Symlink,
  Version,
  BitObject,
  BitRawObject,
  Ref,
  Repository,
  Lane,
  ComponentLog,
  ComponentItem,
  IndexType,
  ObjectItem,
  ObjectList,
  DependenciesGraph,
} from '@teambit/scope.objects';
import { RemovedObjects } from './removed-components';
import { Tmp } from './repositories';
import SourcesRepository from './repositories/sources';
import { getPath as getScopeJsonPath, ScopeJson, getHarmonyPath } from './scope-json';
import ClientIdInUse from './exceptions/client-id-in-use';
import { getDivergeData } from '@teambit/component.snap-distance';
import { StagedSnaps } from './staged-snaps';
import { collectGarbage } from './garbage-collector';
import { getBitVersion } from '@teambit/bit.get-bit-version';

const removeNils = R.reject(R.isNil);
const pathHasScope = pathHasAll([OBJECTS_DIR, SCOPE_JSON]);

type HasIdOpts = {
  includeSymlink?: boolean;
  includeVersion?: boolean;
};

export type ScopeDescriptor = {
  name: string;
};

export type ScopeProps = {
  path: string;
  scopeJson: ScopeJson;
  created?: boolean;
  tmp?: Tmp;
  sources?: SourcesRepository;
  objects: Repository;
  isBare?: boolean;
};

export type IsolateOptions = {
  directory: string | null | undefined;
  write_bit_dependencies: boolean | null | undefined;
  links: boolean | null | undefined;
  install_packages: boolean | null | undefined;
  installPeerDependencies: boolean | null | undefined;
  no_package_json: boolean | null | undefined;
  override: boolean | null | undefined;
};

export type GarbageCollectorOpts = {
  verbose?: boolean;
  dryRun?: boolean;
  findCompIdOrigin?: string;
  findScopeIdOrigin?: string;
  restore?: boolean;
  restoreOverwrite?: boolean;
};

export type ComponentsAndVersions = {
  component: ModelComponent;
  version: Version;
  versionStr: string;
};

export type LegacyOnTagResult = {
  id: ComponentID;
  builderData: ExtensionDataEntry;
};

export type IsolateComponentsOptions = {
  packageManagerConfigRootDir?: string;
};

export default class Scope {
  created = false;
  scopeJson: ScopeJson;
  tmp: Tmp;
  path: string;
  isBare = false;
  scopeImporter: ScopeComponentsImporter;
  sources: SourcesRepository;
  objects: Repository;
  lanes: Lanes;
  /**
   * important! never use this function directly, even inside this class. Only use getCurrentLaneId().
   *
   * normally, the data about the current-lane is saved in .bitmap. the reason for having this prop here is that we
   * need this data when loading model-component, which gets called in multiple places where the consumer is not passed.
   * another instance this is needed is for bit-sign, this way when loading aspects and fetching dists, it'll go to lane-scope.
   */
  private currentLaneId?: LaneId;
  /**
   * when the consumer is available, this function is set with the consumer.getCurrentLaneIdIfExist, so then we guarantee
   * that it's always in sync with the consumer.
   */
  currentLaneIdFunc?: () => LaneId | undefined;
  notExportedIdsFunc?: () => ComponentIdList;
  stagedSnaps: StagedSnaps;
  constructor(scopeProps: ScopeProps) {
    this.path = scopeProps.path;
    this.scopeJson = scopeProps.scopeJson;
    this.created = scopeProps.created || false;
    this.tmp = scopeProps.tmp || new Tmp(this);
    this.sources = scopeProps.sources || new SourcesRepository(this);
    this.objects = scopeProps.objects;
    this.lanes = new Lanes(this.objects, this.scopeJson);
    this.isBare = scopeProps.isBare ?? false;
    this.scopeImporter = ScopeComponentsImporter.getInstance(this);
    this.setStagedSnaps();
  }

  setStagedSnaps() {
    this.stagedSnaps = StagedSnaps.load(this.path);
  }

  static onPostExport: (ids: ComponentID[], lanes: Lane[]) => Promise<void>; // enable extensions to hook after the export process

  public async refreshScopeIndex(force = false) {
    await this.objects.reloadScopeIndexIfNeed(force);
  }

  getCurrentLaneId(): LaneId | undefined {
    if (this.currentLaneIdFunc) return this.currentLaneIdFunc();
    return this.currentLaneId;
  }

  get notExportedIds(): ComponentIdList {
    if (this.notExportedIdsFunc) return this.notExportedIdsFunc();
    return new ComponentIdList();
  }

  isExported(id: ComponentID): boolean {
    if (!this.notExportedIdsFunc) return true; // there is no workspace, it must be exported
    return id.hasScope() && !this.notExportedIds.hasWithoutVersion(id);
  }

  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  get groupName(): string | null | undefined {
    if (!this.scopeJson.groupName) return null;
    return this.scopeJson.groupName;
  }

  get name(): string {
    return this.scopeJson.name;
  }

  get isLegacy(): boolean {
    const harmonyScopeJsonPath = getHarmonyPath(this.path);
    return !fs.existsSync(harmonyScopeJsonPath);
  }

  setCurrentLaneId(laneId?: LaneId) {
    if (!laneId) return;
    if (laneId.isDefault()) this.currentLaneId = undefined;
    else this.currentLaneId = laneId;
  }

  isLocal(componentId: ComponentID) {
    return componentId.isLocal(this.name) || !this.isExported(componentId);
  }

  getPath() {
    return this.path;
  }

  getComponentsPath(): string {
    return pathLib.join(this.path, Scope.getComponentsRelativePath());
  }

  /**
   * Get the relative components path inside the scope
   * (components such as compilers / testers / extensions)
   * currently components
   */
  static getComponentsRelativePath(): string {
    return BITS_DIRNAME;
  }

  /**
   * Get a relative (to scope) path to a specific component such as compiler / tester / extension
   * Support getting the latest installed version
   * @param {BitId} id
   */
  static getComponentRelativePath(id: BitId, scopePath?: string): string {
    if (!id.scope) {
      throw new Error('could not find id.scope');
    }
    const relativePath = pathLib.join(id.name, id.scope);
    if (!id.getVersion().latest) {
      if (!id.version) {
        // brought closer because flow can't deduce if it's done in the beginning.
        throw new Error('could not find id.version');
      }
      return pathLib.join(relativePath, id.version);
    }
    if (!scopePath) {
      throw new Error(`could not find the latest version of ${id.toString()} without the scope path`);
    }
    const componentFullPath = pathLib.join(scopePath, Scope.getComponentsRelativePath(), relativePath);
    if (!fs.existsSync(componentFullPath)) return '';
    const versions = readDirIgnoreSystemFilesSync(componentFullPath);
    const latestVersion = semver.maxSatisfying(versions, '*', { includePrerelease: true });
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    return pathLib.join(relativePath, latestVersion!);
  }

  getBitPathInComponentsDir(id: BitId): string {
    return pathLib.join(this.getComponentsPath(), id.toFullPath());
  }

  describe(): ScopeDescriptor {
    return {
      name: this.name,
    };
  }

  toConsumerComponents(components: ModelComponent[]): Promise<Component[]> {
    return Promise.all(
      components
        .filter((comp) => !(comp instanceof Symlink))
        // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
        .map((c) => c.toConsumerComponent(c.latestExisting(this.objects).toString(), this.name, this.objects))
    );
  }

  async hasId(id: ComponentID, opts: HasIdOpts) {
    const filter = (comp: ComponentItem) => {
      const symlinkCond = opts.includeSymlink ? true : !comp.isSymlink;
      const idMatch = comp.id.scope === id.scope && comp.id.name === id.fullName;
      return symlinkCond && idMatch;
    };
    const modelComponentList = await this.objects.listObjectsFromIndex(IndexType.components, filter);
    if (!modelComponentList || !modelComponentList.length) return false;
    if (!opts.includeVersion || !id.version) return true;
    if (id._legacy.getVersion().latest) return true;
    const modelComponent = modelComponentList[0] as ModelComponent;
    return modelComponent.hasVersion(id.version, this.objects);
  }

  async list(): Promise<ModelComponent[]> {
    const filter = (comp: ComponentItem) => !comp.isSymlink;
    const results = await this.objects.listObjectsFromIndex(IndexType.components, filter);
    results.forEach((result) => {
      if (!(result instanceof ModelComponent)) {
        throw new Error(
          `fatal: wrong hash in the index.json file. expect ${result.hash()} to be a ModelComponent, got ${
            result.constructor.name
          }.
please share your "(.git/bit|.bit)/index.json" file with Bit team to investigate the issue.
once done, to continue working, please run "bit cc"`
        );
      }
    });
    return results as ModelComponent[];
  }

  async listIncludesSymlinks(): Promise<Array<ModelComponent | Symlink>> {
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    return this.objects.listObjectsFromIndex(IndexType.components);
  }

  async listIncludeRemoteHead(laneId: LaneId): Promise<ModelComponent[]> {
    const components = await this.list();
    const lane = laneId.isDefault() ? undefined : await this.loadLane(laneId);
    await Promise.all(components.map((component) => component.populateLocalAndRemoteHeads(this.objects, lane)));
    return components;
  }

  async listLocal(): Promise<ModelComponent[]> {
    const listResults = await this.list();
    return listResults.filter((result) => !result.scope || result.scope === this.name);
  }

  async listLanes(): Promise<Lane[]> {
    return this.lanes.listLanes();
  }

  async loadLane(id: LaneId): Promise<Lane | undefined> {
    return this.lanes.loadLane(id);
  }

  async loadLaneByHash(ref: Ref): Promise<Lane | null> {
    const lane = (await this.objects.load(ref)) as Lane | null;
    return lane;
  }

  /**
   * returns null if we can't determine whether it's on the lane or not.
   * if throwForDivergeDataErr is false, it also returns null when divergeData wasn't able to get Version objects or failed for whatever reason.
   *
   * sadly, there are not good tests for this. it pretty complex to create them as it involves multiple scopes and
   * packages installations. be careful when changing this.
   * the goal is to check whether a given id with the given version exits on the given lane or it's on main.
   * it's needed for importing artifacts to know whether the artifact could be found on the origin scope or on the
   * lane-scope
   */
  async isIdOnLane(id: ComponentID, lane?: Lane | null, throwForDivergeDataErr = true): Promise<boolean | null> {
    if (!lane) return false;

    // it's important to remove the version here before passing it to the `getModelComponent` function.
    // otherwise, in case this version doesn't exist, it'll throw a ComponentNotFound error.
    const component = await this.getModelComponent(id.changeVersion(undefined));
    // it's possible that main was merged to the lane, so the ref in the lane object is actually a tag.
    // in which case, we prefer to go to main instead of the lane.
    // for some reason (needs to check why) the tag-artifacts which got created using merge+tag from-scope
    // exist only on main and not on the lane-scope.
    if (!component.head) return true; // it's not on main. must be on a lane. (even if it was forked from another lane, current lane must have all objects)
    if (component.head.toString() === id.version) return false; // it's on main
    if (isTag(id.version)) return false; // tags can be on main only

    const laneIds = lane.toBitIds();
    if (laneIds.has(id)) return true; // in the lane with the same version
    const laneIdWithDifferentVersion = laneIds.searchWithoutVersion(id);
    if (!laneIdWithDifferentVersion) return false; // not in the lane at all

    // component is in the lane object but with a different version.
    // we have to figure out whether the current version exists on the lane or not.
    // get the diverge between main and the lane.
    const divergeData = await getDivergeData({
      repo: this.objects,
      modelComponent: component,
      throws: throwForDivergeDataErr,
      targetHead: component.head, // target is main
      sourceHead: Ref.from(laneIdWithDifferentVersion.version as string), // source is lane
    });
    // if the snap found "locally", then it's on the lane.
    const foundOnLane = Boolean(divergeData.snapsOnSourceOnly.find((snap) => snap.toString() === id.version));
    if (foundOnLane) return true;
    const foundOnMain = Boolean(divergeData.snapsOnTargetOnly.find((snap) => snap.toString() === id.version));
    if (foundOnMain) return false;
    // we don't have enough data to determine whether it's on the lane or not.
    return null;
  }

  async isPartOfLaneHistoryOrMain(id: ComponentID, lane: Lane) {
    if (!id.version) throw new Error(`isIdOnGivenLane expects id with version, got ${id.toString()}`);
    const laneIds = lane.toComponentIdsIncludeUpdateDependents();
    if (laneIds.has(id)) return true; // in the lane with the same version
    if (isTag(id.version)) return true; // tags can be on main only

    const component = await this.getModelComponent(id.changeVersion(undefined));
    if (component.head && component.head.toString() === id.version) return true; // it's on main

    const version = await component.loadVersion(id.version as string, this.objects, false);
    if (version?.originLaneId?.isEqual(lane.toLaneId())) return true; // on lane
    if (version?.origin && !version.origin.lane) return true; // on main

    const isPartOfLane = async () => {
      const laneIdWithDifferentVersion = laneIds.searchWithoutVersion(id);
      if (!laneIdWithDifferentVersion) return false; // not in the lane at all
      const laneVersionRef = Ref.from(laneIdWithDifferentVersion.version as string);
      const verHistory = await component.getAndPopulateVersionHistory(this.objects, laneVersionRef);
      const verRef = component.getRef(id.version);
      if (!verRef) throw new Error(`isIdOnGivenLane unable to find ref for ${id.toString()}`);
      return verHistory.isRefPartOfHistory(laneVersionRef, verRef);
    };

    const isPartOfMain = async () => {
      if (!component.head) return false; // it's not on main. must be on a lane. (even if it was forked from another lane, current lane must have all objects)
      const verHistory = await component.getAndPopulateVersionHistory(this.objects, component.head);
      const verRef = Ref.from(id.version);
      return verHistory.isRefPartOfHistory(component.head, verRef);
    };

    return (await isPartOfLane()) || (await isPartOfMain());
  }

  async isPartOfMainHistory(id: ComponentID) {
    if (!id.version) throw new Error(`isIdOnMain expects id with version, got ${id.toString()}`);
    if (isTag(id.version)) return true; // tags can be on main only
    const component = await this.getModelComponent(id.changeVersion(undefined));
    if (!component.head) return false; // it's not on main. must be on a lane. (even if it was forked from another lane, current lane must have all objects)
    if (component.head.toString() === id.version) return true; // it's on main

    const verHistory = await component.getAndPopulateVersionHistory(this.objects, component.head);
    const verRef = Ref.from(id.version);
    return verHistory.isRefPartOfHistory(component.head, verRef);
  }

  async latestVersions(componentIds: ComponentID[], throwOnFailure = true): Promise<ComponentIdList> {
    componentIds = componentIds.map((componentId) => componentId.changeVersion(undefined));
    const components = await this.sources.getMany(componentIds);
    const ids = components.map((component) => {
      const getVersion = () => {
        if (component.component) {
          return component.component.getHeadRegardlessOfLaneAsTagOrHash();
        }
        if (throwOnFailure) throw new ComponentNotFound(component.id.toString());
        return DEFAULT_BIT_VERSION;
      };
      const version = getVersion();
      return component.id.changeVersion(version);
    });
    return ComponentIdList.fromArray(ids);
  }

  getObject(hash: string): Promise<BitObject> {
    return new Ref(hash).load(this.objects);
  }

  getRawObject(hash: string): Promise<BitRawObject> {
    return this.objects.loadRawObject(new Ref(hash));
  }

  getObjectItems(refs: Ref[]): Promise<ObjectItem[]> {
    return Promise.all(
      refs.map(async (ref) => ({
        ref,
        buffer: await this.objects.loadRaw(ref),
      }))
    );
  }

  async getObjectItem(ref: Ref): Promise<ObjectItem> {
    return {
      ref,
      buffer: await this.objects.loadRaw(ref),
    };
  }

  async getModelComponentIfExist(id: ComponentID): Promise<ModelComponent | undefined> {
    return this.sources.get(id);
  }

  async getCurrentLaneObject(): Promise<Lane | undefined> {
    const currentLaneId = this.getCurrentLaneId();
    return currentLaneId ? this.loadLane(currentLaneId) : undefined;
  }

  /**
   * Remove components from scope
   * @force Boolean - remove component from scope even if other components use it
   */
  async removeMany(bitIds: ComponentIdList, force: boolean, consumer?: Consumer): Promise<RemovedObjects> {
    logger.debug(`scope.removeMany ${bitIds.toString()} with force flag: ${force.toString()}`);
    Analytics.addBreadCrumb(
      'removeMany',
      `scope.removeMany ${Analytics.hashData(bitIds)} with force flag: ${force.toString()}`
    );
    const currentLane = await consumer?.getCurrentLaneObject();
    const removeComponents = new RemoveModelComponents(this, bitIds, force, consumer, currentLane);
    return removeComponents.remove();
  }

  /**
   * for each one of the given components, find its dependents
   */
  async getDependentsBitIds(
    bitIds: ComponentID[],
    returnResultsWithVersion = false
  ): Promise<{ [key: string]: ComponentIdList }> {
    logger.debug(`scope.getDependentsBitIds, bitIds: ${bitIds.toString()}`);
    const idsGraph = await DependencyGraph.buildIdsGraphWithAllVersions(this);
    logger.debug(`scope.getDependentsBitIds, idsGraph the graph was built successfully`);
    const dependencyGraph = new DependencyGraph(idsGraph);
    const dependentsGraph = bitIds.reduce((acc, current) => {
      const dependents = dependencyGraph.getDependentsForAllVersions(current);
      if (dependents.length) {
        const dependentsIds = dependents.map((id) => (returnResultsWithVersion ? id : id.changeVersion(undefined)));
        acc[current.toStringWithoutVersion()] = ComponentIdList.uniqFromArray(dependentsIds);
      }
      return acc;
    }, {});

    return dependentsGraph;
  }

  /**
   * split bit array to found and missing components (incase user misspelled id)
   */
  async filterFoundAndMissingComponents(
    bitIds: ComponentID[]
  ): Promise<{ missingComponents: ComponentIdList; foundComponents: ComponentIdList }> {
    const missingComponents: ComponentIdList = new ComponentIdList();
    const foundComponents: ComponentIdList = new ComponentIdList();
    const resultP = bitIds.map(async (id) => {
      const component = await this.getModelComponentIfExist(id);
      if (!component) missingComponents.push(id);
      else foundComponents.push(id);
    });
    await Promise.all(resultP);
    return { missingComponents, foundComponents };
  }

  /**
   * load components from the model and return them as ComponentVersion array.
   * if a component is not available locally, it'll just ignore it without throwing any error.
   */
  async loadLocalComponents(ids: ComponentIdList): Promise<ComponentVersion[]> {
    const componentsObjects = await this.sources.getMany(ids);
    const components = componentsObjects.map((componentObject) => {
      const component = componentObject.component;
      if (!component) return null;
      const version = componentObject.id.hasVersion()
        ? componentObject.id.version
        : component.getHeadRegardlessOfLaneAsTagOrHash(true);
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      return component.toComponentVersion(version);
    });
    return removeNils(components);
  }

  async loadComponentLogs(
    id: ComponentID,
    shortHash = false,
    startFrom?: string,
    throwIfMissing = false
  ): Promise<ComponentLog[]> {
    const componentModel = throwIfMissing ? await this.getModelComponent(id) : await this.getModelComponentIfExist(id);
    if (!componentModel) return [];
    const startFromRef = startFrom ? (componentModel.getRef(startFrom) ?? undefined) : undefined;
    const logs = await componentModel.collectLogs(this, shortHash, startFromRef);
    return logs;
  }

  loadAllVersions(id: ComponentID): Promise<Component[]> {
    return this.getModelComponentIfExist(id).then((componentModel) => {
      if (!componentModel) throw new ComponentNotFound(id.toString());
      return componentModel.collectVersions(this.objects);
    });
  }

  /**
   * get ModelComponent instance per bit-id.
   * it throws an error if the component wasn't found.
   * @see getModelComponentIfExist to not throw an error
   */
  async getModelComponent(id: ComponentID): Promise<ModelComponent> {
    const component = await this.getModelComponentIfExist(id);
    if (component) {
      return component;
    }
    throw new ComponentNotFound(id.toString());
  }

  /**
   * throws if component was not found
   */
  async getConsumerComponent(id: ComponentID): Promise<Component> {
    const modelComponent: ModelComponent = await this.getModelComponent(id);
    // $FlowFixMe version must be set
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    const componentVersion = modelComponent.toComponentVersion(id.version);
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    return componentVersion.toConsumer(this.objects);
  }

  async getManyConsumerComponents(ids: ComponentID[]): Promise<Component[]> {
    return Promise.all(ids.map((id) => this.getConsumerComponent(id)));
  }

  /**
   * return undefined if component was not found
   */
  async getConsumerComponentIfExist(id: ComponentID): Promise<Component | undefined> {
    const modelComponent: ModelComponent | undefined = await this.getModelComponentIfExist(id);
    if (!modelComponent) return undefined;
    const componentVersion = modelComponent.toComponentVersion(id.version);
    return componentVersion.toConsumer(this.objects);
  }

  async getVersionInstance(id: ComponentID): Promise<Version> {
    if (!id.hasVersion()) throw new TypeError(`scope.getVersionInstance - id ${id.toString()} is missing the version`);
    const component: ModelComponent = await this.getModelComponent(id);
    return component.loadVersion(id.version as string, this.objects);
  }

  async getComponentsAndVersions(
    ids: ComponentIdList,
    defaultToLatestVersion = false
  ): Promise<ComponentsAndVersions[]> {
    const componentsObjects = await this.sources.getMany(ids);
    const componentsAndVersionsP = componentsObjects.map(async (componentObjects) => {
      if (!componentObjects.component) return null;
      const component: ModelComponent = componentObjects.component;
      const getVersionStr = (): string => {
        if (componentObjects.id.hasVersion()) return componentObjects.id._legacy.getVersion().toString();
        if (!defaultToLatestVersion)
          throw new Error(`getComponentsAndVersions expect ${componentObjects.id.toString()} to have a version`);
        return componentObjects.component?.getHeadRegardlessOfLaneAsTagOrHash() as string;
      };
      const versionStr = getVersionStr();
      const version: Version = await component.loadVersion(versionStr, this.objects);
      return { component, version, versionStr };
    });
    const componentsAndVersions = await Promise.all(componentsAndVersionsP);
    return removeNils(componentsAndVersions);
  }

  async isComponentInScope(id: ComponentID): Promise<boolean> {
    const comp = await this.sources.get(id);
    return Boolean(comp);
  }

  /**
   * Creates a symlink object with the local-scope which links to the real-object of the remote-scope
   * This way, local components that have dependencies to the exported component won't break.
   */
  createSymlink(id: ComponentID, remote: string) {
    const symlink = new Symlink({
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      scope: id.scope,
      name: id.fullName,
      realScope: remote,
    });
    return this.objects.add(symlink);
  }

  ensureDir() {
    fs.ensureDirSync(this.getComponentsPath());
    return this.tmp
      .ensureDir()
      .then(() => this.scopeJson.write(this.getPath()))
      .then(() => this.objects.ensureDir())
      .then(() => this);
  }

  async loadModelComponentByIdStr(id: string): Promise<ModelComponent | Symlink> {
    // Remove the version before hashing since hashing with the version number will result a wrong hash
    const idWithoutVersion = ComponentID.getStringWithoutVersion(id);
    const ref = Ref.from(BitObject.makeHash(idWithoutVersion));
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    return this.objects.load(ref);
  }

  async getParsedId(id: BitIdStr): Promise<ComponentID> {
    if (id.startsWith('@')) {
      throw new UnexpectedPackageName(id);
    }
    const component = await this.loadModelComponentByIdStr(id);
    const idHasScope = Boolean(component && component.scope);
    if (idHasScope) {
      const bitId = component.toComponentId();
      const version = ComponentID.getVersionFromString(id);
      return bitId.changeVersion(version || LATEST);
    }
    const [idWithoutVersion, version] = id.toString().split('@');
    if (idWithoutVersion.includes('.')) {
      // we allow . only on scope names, so if it has . it must be with scope name
      return ComponentID.fromString(id);
    }
    const filter = (comp: ComponentItem) => comp.id.name === idWithoutVersion;
    const fromIndex = this.objects.getHashFromIndex(IndexType.components, filter);
    if (fromIndex) {
      // the given id is only the name, find out the full-id
      const obj = await this.objects._getBitObjectsByHashes([fromIndex]);
      const modelComp = obj[0] as ModelComponent;
      return modelComp.toComponentId().changeVersion(version);
    }
    const idSplit = id.split('/');
    if (idSplit.length === 1) {
      // it doesn't have any slash, so the id doesn't include the scope-name
      throw new Error(`scope.getParsedId, the component ${id} must include a scope-name`);
    }
    const maybeScope = idSplit[0];
    const isRemoteConfiguredLocally = this.scopeJson.remotes[maybeScope];
    if (isRemoteConfiguredLocally) {
      return ComponentID.fromString(id);
    }
    return ComponentID.fromString(id);
  }

  async writeObjectsToPendingDir(objectList: ObjectList, clientId: string): Promise<void> {
    const pendingDir = pathLib.join(this.path, PENDING_OBJECTS_DIR, clientId);
    if (fs.pathExistsSync(pendingDir)) {
      throw new ClientIdInUse(clientId);
    }
    await this.objects.writeObjectsToPendingDir(objectList, pendingDir);
  }

  async readObjectsFromPendingDir(clientId: string): Promise<ObjectList> {
    // @todo: implement the wait() mechanism.
    const pendingDir = pathLib.join(this.path, PENDING_OBJECTS_DIR, clientId);
    return this.objects.readObjectsFromPendingDir(pendingDir);
  }

  async removePendingDir(clientId: string) {
    const pendingDir = pathLib.join(this.path, PENDING_OBJECTS_DIR, clientId);
    try {
      await fs.remove(pendingDir); // no error is thrown if not exists
    } catch (err: any) {
      if (err.code === 'ENOTEMPTY') {
        // it rarely happens, but when it does, the export gets stuck. it's probably a bug with fs-extra.
        // a workaround is to try again after a second.
        // see this: https://github.com/jprichardson/node-fs-extra/issues/532
        await new Promise((resolve) => setTimeout(resolve, 1000));
        await fs.remove(pendingDir);
      } else {
        throw err;
      }
    }
  }

  async garbageCollect(opts: GarbageCollectorOpts) {
    return collectGarbage(this, opts);
  }

  static async ensure(path: PathOsBasedAbsolute, name?: string | null, groupName?: string | null): Promise<Scope> {
    if (pathHasScope(path)) return this.load(path);
    const scopeJson = Scope.ensureScopeJson(path, name, groupName);
    const repository = await Repository.create({ scopePath: path, scopeJson });
    const scope = new Scope({ path, created: true, scopeJson, objects: repository });
    Scope.scopeCache[path] = scope;
    return scope;
  }

  static ensureScopeJson(
    path: PathOsBasedAbsolute,
    name?: string | null | undefined,
    groupName?: string | null | undefined
  ): ScopeJson {
    if (!name) name = pathLib.basename(process.cwd());
    if (name === CURRENT_UPSTREAM) {
      throw new BitError(`the name "${CURRENT_UPSTREAM}" is a reserved word, please use another name`);
    }
    const scopeJson = new ScopeJson({ name, groupName, version: getBitVersion() });
    return scopeJson;
  }

  static scopeCache: { [path: string]: Scope } = {};

  static async reset(path: PathOsBasedAbsolute, resetHard: boolean): Promise<void> {
    await Repository.reset(path);
    if (resetHard) {
      logger.info(`deleting the whole scope at ${path}`);
      await fs.emptyDir(path);
    }
    Scope.scopeCache = {};
  }

  static async load(absPath: string, useCache = true): Promise<Scope> {
    let scopePath = findScopePath(absPath);
    if (!scopePath) throw new ScopeNotFound(absPath);
    if (fs.existsSync(pathLib.join(scopePath, BIT_HIDDEN_DIR))) {
      scopePath = pathLib.join(scopePath, BIT_HIDDEN_DIR);
    }
    if (useCache && Scope.scopeCache[scopePath]) {
      logger.debug(`scope.load, found scope at ${scopePath} from cache`);
      return Scope.scopeCache[scopePath];
    }
    const scopeJsonPath = getScopeJsonPath(scopePath);
    const scopeJsonExist = fs.existsSync(scopeJsonPath);
    let scopeJson;
    if (scopeJsonExist) {
      scopeJson = await ScopeJson.loadFromFile(scopeJsonPath);
    } else {
      scopeJson = Scope.ensureScopeJson(scopePath);
    }
    const objects = await Repository.load({ scopePath, scopeJson });
    const isBare =
      !scopePath.endsWith(pathLib.join(BIT_HIDDEN_DIR)) && !scopePath.endsWith(pathLib.join(DOT_GIT_DIR, BIT_GIT_DIR));
    const scope = new Scope({ path: scopePath, scopeJson, objects, isBare });
    Scope.scopeCache[scopePath] = scope;
    return scope;
  }

  public async getDependenciesGraphByComponentIds(componentIds: ComponentID[]): Promise<DependenciesGraph | undefined> {
    let allGraph: DependenciesGraph | undefined;
    if (!isFeatureEnabled(DEPS_GRAPH)) return undefined;
    await Promise.all(
      componentIds.map(async (componentId) => {
        const graph = await this.getDependenciesGraphByComponentId(componentId);
        if (graph == null || graph.isEmpty()) return;
        if (allGraph == null) {
          allGraph = graph;
        } else {
          allGraph.merge(graph);
        }
      })
    );
    return allGraph;
  }

  public async getDependenciesGraphByComponentId(id: ComponentID): Promise<DependenciesGraph | undefined> {
    let versionObj: Version;
    try {
      versionObj = await this.getVersionInstance(id);
    } catch (err) {
      return undefined;
    }
    return versionObj.loadDependenciesGraph(this.objects);
  }

  public async loadDependenciesGraphForComponent(component: Component): Promise<void> {
    component.dependenciesGraph = await this.getDependenciesGraphByComponentId(component.id);
  }
}

function composePath(patternPath: string, patterns: string[]): string[] {
  return patterns.map((pattern) => {
    return pathLib.join(patternPath, pattern);
  });
}

/**
 * determine whether given path have all files/dirs
 */
export function pathHasAll(patterns: string[]): (absPath: string) => boolean {
  return (absPath: string) => {
    let state = true;
    const paths = composePath(absPath, patterns);
    for (const potentialPath of paths) {
      if (!state) return false;
      state = fs.existsSync(potentialPath);
    }

    return state;
  };
}
