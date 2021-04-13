import fs from 'fs-extra';
import mapSeries from 'p-map-series';
import * as pathLib from 'path';
import R from 'ramda';
import semver from 'semver';
import { Analytics } from '../analytics/analytics';
import { BitId, BitIds } from '../bit-id';
import { BitIdStr } from '../bit-id/bit-id';
import loader from '../cli/loader';
import { BEFORE_MIGRATION, BEFORE_RUNNING_BUILD, BEFORE_RUNNING_SPECS } from '../cli/loader/loader-messages';
import {
  BIT_GIT_DIR,
  BIT_HIDDEN_DIR,
  BIT_VERSION,
  BITS_DIRNAME,
  COMPONENT_ORIGINS,
  CURRENT_UPSTREAM,
  DEFAULT_BIT_VERSION,
  DOT_GIT_DIR,
  LATEST,
  NODE_PATH_SEPARATOR,
  OBJECTS_DIR,
  SCOPE_JSON,
  PENDING_OBJECTS_DIR,
} from '../constants';
import Component from '../consumer/component/consumer-component';
import Dists from '../consumer/component/sources/dists';
import { ExtensionDataEntry } from '../consumer/config';
import Consumer from '../consumer/consumer';
import SpecsResults from '../consumer/specs-results';
import { SpecsResultsWithComponentId } from '../consumer/specs-results/specs-results';
import GeneralError from '../error/general-error';
import LaneId from '../lane-id/lane-id';
import logger from '../logger/logger';
import getMigrationVersions, { MigrationResult } from '../migration/migration-helper';
import { currentDirName, first, pathHasAll, propogateUntil, readDirSyncIgnoreDsStore } from '../utils';
import { PathOsBasedAbsolute } from '../utils/path';
import RemoveModelComponents from './component-ops/remove-model-components';
import ScopeComponentsImporter from './component-ops/scope-components-importer';
import { getAllVersionHashes } from './component-ops/traverse-versions';
import ComponentVersion from './component-version';
import { ComponentNotFound, ScopeNotFound } from './exceptions';
import DependencyGraph from './graph/scope-graph';
import Lanes from './lanes/lanes';
import migrate, { ScopeMigrationResult } from './migrations/scope-migrator';
import migratonManifest from './migrations/scope-migrator-manifest';
import { ModelComponent, Symlink, Version } from './models';
import Lane from './models/lane';
import { ComponentLog } from './models/model-component';
import { BitObject, BitRawObject, Ref, Repository } from './objects';
import { ComponentItem, IndexType } from './objects/components-index';
import RemovedObjects from './removed-components';
import { Tmp } from './repositories';
import SourcesRepository from './repositories/sources';
import { getPath as getScopeJsonPath, ScopeJson, getHarmonyPath } from './scope-json';
import VersionDependencies from './version-dependencies';
import { ObjectItem, ObjectList } from './objects/object-list';
import ClientIdInUse from './exceptions/client-id-in-use';
import { UnexpectedPackageName } from '../consumer/exceptions/unexpected-package-name';

const removeNils = R.reject(R.isNil);
const pathHasScope = pathHasAll([OBJECTS_DIR, SCOPE_JSON]);

type HasIdOpts = {
  includeSymlink?: boolean;
  includeOrphaned?: boolean;
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

export type ComponentsAndVersions = {
  component: ModelComponent;
  version: Version;
  versionStr: string;
};

export type LegacyOnTagResult = {
  id: BitId;
  builderData: ExtensionDataEntry;
};
export type OnTagOpts = {
  disableDeployPipeline?: boolean;
  throwOnError?: boolean; // on the CI it helps to save the results on failure so this is set to false
  forceDeploy?: boolean; // whether run the deploy-pipeline although the build-pipeline has failed
  skipTests?: boolean;
};
export type OnTagFunc = (components: Component[], options?: OnTagOpts) => Promise<LegacyOnTagResult[]>;

export default class Scope {
  created = false;
  scopeJson: ScopeJson;
  tmp: Tmp;
  path: string;
  isBare = false;
  scopeImporter: ScopeComponentsImporter;
  sources: SourcesRepository;
  objects: Repository;
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  _dependencyGraph: DependencyGraph; // cache DependencyGraph instance
  lanes: Lanes;

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
  }

  public onTag: OnTagFunc[] = []; // enable extensions to hook during the tag process
  static onPostExport: (ids: BitId[], lanes: Lane[]) => Promise<void>; // enable extensions to hook after the export process

  /**
   * import components to the `Scope.
   */
  async import(ids: BitIds, cache = true): Promise<VersionDependencies[]> {
    return this.scopeImporter.importMany(ids, cache);
  }

  async getDependencyGraph(): Promise<DependencyGraph> {
    if (!this._dependencyGraph) {
      this._dependencyGraph = await DependencyGraph.loadAllVersions(this);
    }
    return this._dependencyGraph;
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
    const versions = readDirSyncIgnoreDsStore(componentFullPath);
    const latestVersion = semver.maxSatisfying(versions, '*');
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    return pathLib.join(relativePath, latestVersion!);
  }

  getBitPathInComponentsDir(id: BitId): string {
    return pathLib.join(this.getComponentsPath(), id.toFullPath());
  }

  /**
   * Running migration process for scope to update the stores (bit objects) to the current version
   *
   * @param {any} verbose - print debug logs
   * @returns {Object} - wether the process run and wether it successeded
   * @memberof Consumer
   */
  async migrate(verbose: boolean): Promise<MigrationResult> {
    logger.trace('scope.migrate, running migration process for scope');
    if (verbose) console.log('running migration process for scope'); // eslint-disable-line
    // We start to use this process after version 0.10.9, so we assume the scope is in the last production version
    const scopeVersion = this.scopeJson.get('version') || '0.10.9';
    if (semver.gte(scopeVersion, BIT_VERSION)) {
      const upToDateMsg = 'scope version is up to date';
      if (verbose) console.log(upToDateMsg); // eslint-disable-line
      logger.trace(`scope.migrate, ${upToDateMsg}`);
      return {
        run: false,
      };
    }
    loader.start(BEFORE_MIGRATION);
    logger.debugAndAddBreadCrumb(
      'scope.migrate',
      `start scope migration. scope version ${scopeVersion}, bit version ${BIT_VERSION}`
    );
    const migrations = getMigrationVersions(BIT_VERSION, scopeVersion, migratonManifest, verbose);
    const rawObjects = migrations.length ? await this.objects.listRawObjects() : [];
    // @ts-ignore
    const resultObjects: ScopeMigrationResult = await migrate(migrations, rawObjects, verbose);
    if (!R.isEmpty(resultObjects.newObjects) || !R.isEmpty(resultObjects.refsToRemove)) {
      // Add the new / updated objects
      this.objects.addMany(resultObjects.newObjects);
      // Remove old objects
      this.objects.removeManyObjects(resultObjects.refsToRemove);
      // Persists new / remove objects
      const validateBeforePersist = false;
      await this.objects.persist(validateBeforePersist);
    }

    // Update the scope version
    this.scopeJson.set('version', BIT_VERSION);
    logger.debugAndAddBreadCrumb('scope.migrate', `updating scope version to version ${BIT_VERSION}`);
    await this.scopeJson.write(this.getPath());
    loader.stop();
    return {
      run: true,
      success: true,
    };
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

  async hasId(id: BitId, opts: HasIdOpts) {
    const filter = (comp: ComponentItem) => {
      const symlinkCond = opts.includeSymlink ? true : !comp.isSymlink;
      const idMatch = comp.id.scope === id.scope && comp.id.name === id.name;
      return symlinkCond && idMatch;
    };
    const modelComponentList = await this.objects.listObjectsFromIndex(IndexType.components, filter);
    if (!modelComponentList || !modelComponentList.length) return false;
    if (!opts.includeVersion || !id.version) return true;
    if (id.getVersion().latest) return true;
    const modelComponent = modelComponentList[0] as ModelComponent;
    if (opts.includeOrphaned) {
      return modelComponent.hasTagIncludeOrphaned(id.version);
    }
    return modelComponent.hasTag(id.version);
  }

  async list(): Promise<ModelComponent[]> {
    const filter = (comp: ComponentItem) => !comp.isSymlink;
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    return this.objects.listObjectsFromIndex(IndexType.components, filter);
  }

  async listIncludesSymlinks(): Promise<Array<ModelComponent | Symlink>> {
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    return this.objects.listObjectsFromIndex(IndexType.components);
  }

  async listIncludeRemoteHead(laneId: LaneId): Promise<ModelComponent[]> {
    const components = await this.list();
    const lane = laneId.isDefault() ? null : await this.loadLane(laneId);
    await Promise.all(components.map((component) => component.populateLocalAndRemoteHeads(this.objects, laneId, lane)));
    return components;
  }

  async listLocal(): Promise<ModelComponent[]> {
    const listResults = await this.list();
    return listResults.filter((result) => !result.scope || result.scope === this.name);
  }

  async listLanes(): Promise<Lane[]> {
    return this.lanes.listLanes();
  }

  async loadLane(id: LaneId): Promise<Lane | null> {
    return this.lanes.loadLane(id);
  }

  async latestVersions(componentIds: BitId[], throwOnFailure = true): Promise<BitIds> {
    componentIds = componentIds.map((componentId) => componentId.changeVersion(undefined));
    const components = await this.sources.getMany(componentIds);
    const ids = components.map((component) => {
      const getVersion = () => {
        if (component.component) {
          return component.component.latest();
        }
        if (throwOnFailure) throw new ComponentNotFound(component.id.toString());
        return DEFAULT_BIT_VERSION;
      };
      const version = getVersion();
      return component.id.changeVersion(version);
    });
    return BitIds.fromArray(ids);
  }

  /**
   * Build multiple components sequentially, not in parallel.
   *
   * Two reasons why not running them in parallel:
   * 1) when several components have the same environment, it'll try to install them multiple times.
   * 2) npm throws errors when running 'npm install' from several directories
   *
   * Also, make sure to first build and write dists files of all components, and only then, write
   * the links inside the dists. otherwise, you it could fail when writing links of one component
   * needs another component dists files. (see 'importing all components and then deleting the dist
   * directory' test case)
   */
  async buildMultiple(
    components: Component[],
    consumer: Consumer,
    noCache: boolean,
    verbose: boolean,
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    dontPrintEnvMsg? = false
  ): Promise<{ component: string; buildResults: string[] | null | undefined }[]> {
    logger.debugAndAddBreadCrumb('scope.buildMultiple', 'scope.buildMultiple: sequentially build multiple components');
    // Make sure to not start the loader if there are no components to build
    if (components && components.length) {
      loader.start(BEFORE_RUNNING_BUILD);
      if (components.length > 1) loader.stopAndPersist({ text: `${BEFORE_RUNNING_BUILD}...` });
    }
    logger.debugAndAddBreadCrumb('scope.buildMultiple', 'using the legacy build mechanism');
    const build = async (component: Component) => {
      if (component.compiler) loader.start(`building component - ${component.id}`);
      await component.build({ scope: this, consumer, noCache, verbose, dontPrintEnvMsg });
      const buildResults = await component.dists.writeDists(component, consumer, false);
      if (component.compiler) loader.succeed();
      return { component: component.id.toString(), buildResults };
    };
    const writeLinks = async (component: Component) => component.dists.writeDistsLinks(component, consumer);

    const buildResults = await mapSeries(components, build);
    await mapSeries(components, writeLinks);
    return buildResults;
  }

  /**
   * when custom-module-resolution is used, the test process needs to set the custom module
   * directory to the dist directory
   */
  injectNodePathIfNeeded(consumer: Consumer, components: Component[]) {
    const nodePathDirDist = Dists.getNodePathDir(consumer);
    // only author components need this injection. for imported the links are built on node_modules
    const isNodePathNeeded =
      nodePathDirDist &&
      components.some(
        (component) =>
          (component.dependencies.isCustomResolvedUsed() || component.devDependencies.isCustomResolvedUsed()) &&
          component.componentMap &&
          component.componentMap.origin === COMPONENT_ORIGINS.AUTHORED &&
          !component.dists.isEmpty()
      );
    if (isNodePathNeeded) {
      const getCurrentNodePathWithDirDist = () => {
        if (!process.env.NODE_PATH) return nodePathDirDist;
        const separator = process.env.NODE_PATH.endsWith(NODE_PATH_SEPARATOR) ? '' : NODE_PATH_SEPARATOR;
        return process.env.NODE_PATH + separator + nodePathDirDist;
      };
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      process.env.NODE_PATH = getCurrentNodePathWithDirDist();
      require('module').Module._initPaths(); // eslint-disable-line
    }
  }

  /**
   * Test multiple components sequentially, not in parallel.
   *
   * See the reason not to run them in parallel at @buildMultiple()
   */
  async testMultiple({
    components,
    consumer,
    verbose,
    dontPrintEnvMsg = false,
    rejectOnFailure = false,
  }: {
    components: Component[];
    consumer: Consumer;
    verbose: boolean;
    dontPrintEnvMsg?: boolean;
    rejectOnFailure?: boolean;
  }): Promise<SpecsResultsWithComponentId> {
    logger.debugAndAddBreadCrumb('scope.testMultiple', 'scope.testMultiple: sequentially test multiple components');
    // Make sure not starting the loader when there is nothing to test
    if (components && components.length) {
      loader.start(BEFORE_RUNNING_SPECS);
    }
    this.injectNodePathIfNeeded(consumer, components);
    const test = async (component: Component) => {
      if (!component.tester) {
        return { componentId: component.id, missingTester: true, pass: true };
      }
      const specs = await component.runSpecs({
        scope: this,
        rejectOnFailure,
        consumer,
        verbose,
        dontPrintEnvMsg,
      });
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      const pass = specs ? specs.every((spec) => spec.pass) : true;
      const missingDistSpecs = specs && R.isEmpty(specs);
      return { componentId: component.id, missingDistSpecs, specs, pass };
    };
    return (await mapSeries(components, test)) as SpecsResultsWithComponentId;
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

  async getModelComponentIfExist(id: BitId): Promise<ModelComponent | undefined> {
    const modelComponent = await this.sources.get(id);
    if (modelComponent) {
      // @todo: what about the remote head
      // @todo: what about other places the model-component is loaded
      const currentLane = await this.lanes.getCurrentLaneObject();
      modelComponent.setLaneHeadLocal(currentLane);
    }
    return modelComponent;
  }

  /**
   * Remove components from scope
   * @force Boolean - remove component from scope even if other components use it
   */
  async removeMany(
    bitIds: BitIds,
    force: boolean,
    removeSameOrigin = false,
    consumer?: Consumer
  ): Promise<RemovedObjects> {
    logger.debug(`scope.removeMany ${bitIds.toString()} with force flag: ${force.toString()}`);
    Analytics.addBreadCrumb(
      'removeMany',
      `scope.removeMany ${Analytics.hashData(bitIds)} with force flag: ${force.toString()}`
    );
    const removeComponents = new RemoveModelComponents(this, bitIds, force, removeSameOrigin, consumer);
    return removeComponents.remove();
  }

  /**
   * findDependentBits
   * foreach component in array find the componnet that uses that component
   */
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  async findDependentBits(bitIds: BitIds, returnResultsWithVersion = false): Promise<{ [key: string]: BitId[] }> {
    const allComponents = await this.list();
    const allComponentVersions = await Promise.all(
      allComponents.map(async (component: ModelComponent) => {
        const allRefs = await getAllVersionHashes(component, this.objects, false);
        const loadedVersions = await Promise.all(
          allRefs.map(async (ref) => {
            const componentVersion = await component.loadVersion(ref.toString(), this.objects, false);
            if (!componentVersion) return null;
            // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
            componentVersion.id = component.toBitId();
            return componentVersion;
          })
        );
        return loadedVersions.filter((x) => x);
      })
    );
    const allScopeComponents = R.flatten(allComponentVersions);
    const dependentBits = {};
    bitIds.forEach((bitId) => {
      const dependencies = [];
      allScopeComponents.forEach((scopeComponents) => {
        scopeComponents.flattenedDependencies.forEach((flattenedDependency) => {
          if (flattenedDependency.isEqualWithoutVersion(bitId)) {
            if (returnResultsWithVersion) {
              // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
              dependencies.push(scopeComponents.id);
            } else {
              // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
              dependencies.push(scopeComponents.id.changeVersion(null));
            }
          }
        });
      });

      if (!R.isEmpty(dependencies)) {
        dependentBits[bitId.toStringWithoutVersion()] = BitIds.uniqFromArray(dependencies);
      }
    });
    return Promise.resolve(dependentBits);
  }

  /**
   * split bit array to found and missing components (incase user misspelled id)
   */
  async filterFoundAndMissingComponents(
    bitIds: BitIds
  ): Promise<{ missingComponents: BitIds; foundComponents: BitIds }> {
    const missingComponents = new BitIds();
    const foundComponents = new BitIds();
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
  async loadLocalComponents(ids: BitIds): Promise<ComponentVersion[]> {
    const componentsObjects = await this.sources.getMany(ids);
    const components = componentsObjects.map((componentObject) => {
      const component = componentObject.component;
      if (!component) return null;
      const version = componentObject.id.hasVersion() ? componentObject.id.version : component.latest();
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      return component.toComponentVersion(version);
    });
    return removeNils(components);
  }

  async loadComponentLogs(id: BitId): Promise<ComponentLog[]> {
    const componentModel = await this.getModelComponentIfExist(id);
    if (!componentModel) return [];
    const logs = await componentModel.collectLogs(this.objects);
    return logs;
  }

  loadAllVersions(id: BitId): Promise<Component[]> {
    return this.getModelComponentIfExist(id).then((componentModel) => {
      if (!componentModel) throw new ComponentNotFound(id.toString());
      return componentModel.collectVersions(this.objects);
    });
  }

  /**
   * get ModelComponent instance per bit-id.
   * it throws an error if the component wasn't found.
   * @see getModelComponentIfExist to not throw an error
   * @see getModelComponentIgnoreScope to ignore the scope name
   */
  async getModelComponent(id: BitId): Promise<ModelComponent> {
    const component = await this.getModelComponentIfExist(id);
    if (component) {
      return component;
    }
    throw new ComponentNotFound(id.toString());
  }

  /**
   * the id can be either with or without a scope-name.
   * in case the component is saved in the model only with the scope (imported), it loads all
   * components and search for it.
   * it throws an error if the component wasn't found.
   */
  async getModelComponentIgnoreScope(id: BitId): Promise<ModelComponent> {
    const component = await this.getModelComponentIfExist(id);
    if (component) return component;
    if (!id.scope) {
      // search for the complete ID
      const components: ModelComponent[] = await this.list();
      const foundComponent = components.filter((c) => c.toBitId().isEqualWithoutScopeAndVersion(id));
      if (foundComponent.length) return first(foundComponent);
    }
    throw new ComponentNotFound(id.toString());
  }

  /**
   * throws if component was not found
   */
  async getConsumerComponent(id: BitId): Promise<Component> {
    const modelComponent: ModelComponent = await this.getModelComponent(id);
    // $FlowFixMe version must be set
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    const componentVersion = modelComponent.toComponentVersion(id.version);
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    return componentVersion.toConsumer(this.objects);
  }

  async getManyConsumerComponents(ids: BitId[]): Promise<Component[]> {
    return Promise.all(ids.map((id) => this.getConsumerComponent(id)));
  }

  /**
   * return undefined if component was not found
   */
  async getConsumerComponentIfExist(id: BitId): Promise<Component | undefined> {
    const modelComponent: ModelComponent | undefined = await this.getModelComponentIfExist(id);
    if (!modelComponent) return undefined;
    // $FlowFixMe version must be set
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    const componentVersion = modelComponent.toComponentVersion(id.version);
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    return componentVersion.toConsumer(this.objects);
  }

  async getVersionInstance(id: BitId): Promise<Version> {
    if (!id.hasVersion()) throw new TypeError(`scope.getVersionInstance - id ${id.toString()} is missing the version`);
    const component: ModelComponent = await this.getModelComponent(id);
    return component.loadVersion(id.version as string, this.objects);
  }

  async getComponentsAndVersions(ids: BitIds, defaultToLatestVersion = false): Promise<ComponentsAndVersions[]> {
    const componentsObjects = await this.sources.getMany(ids);
    const componentsAndVersionsP = componentsObjects.map(async (componentObjects) => {
      if (!componentObjects.component) return null;
      const component: ModelComponent = componentObjects.component;
      const getVersionStr = (): string => {
        if (componentObjects.id.hasVersion()) return componentObjects.id.getVersion().toString();
        if (!defaultToLatestVersion)
          throw new Error(`getComponentsAndVersions expect ${componentObjects.id.toString()} to have a version`);
        return componentObjects.component?.latest() as string;
      };
      const versionStr = getVersionStr();
      const version: Version = await component.loadVersion(versionStr, this.objects);
      return { component, version, versionStr };
    });
    const componentsAndVersions = await Promise.all(componentsAndVersionsP);
    return removeNils(componentsAndVersions);
  }

  async isComponentInScope(id: BitId): Promise<boolean> {
    const comp = await this.sources.get(id);
    return Boolean(comp);
  }

  async getComponentsAndAllLocalUnexportedVersions(ids: BitIds): Promise<ComponentsAndVersions[]> {
    const componentsObjects = await this.sources.getMany(ids);
    const componentsAndVersionsP = componentsObjects.map(async (componentObjects) => {
      if (!componentObjects.component) return null;
      const component: ModelComponent = componentObjects.component;
      const localVersions = component.getLocalVersions();
      return Promise.all(
        localVersions.map(async (versionStr) => {
          const version: Version = await component.loadVersion(versionStr, this.objects);
          return { component, version, versionStr };
        })
      );
    });
    const componentsAndVersions = await Promise.all(componentsAndVersionsP);
    return removeNils(R.flatten(componentsAndVersions));
  }

  /**
   * Creates a symlink object with the local-scope which links to the real-object of the remote-scope
   * This way, local components that have dependencies to the exported component won't break.
   */
  createSymlink(id: BitId, remote: string) {
    const symlink = new Symlink({
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      scope: id.scope,
      name: id.name,
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

  /**
   * find the components in componentsPool which one of their dependencies include in potentialDependencies
   */
  async findDirectDependentComponents(componentsPool: BitIds, potentialDependencies: BitIds): Promise<BitIds> {
    const componentsVersions = await this.loadLocalComponents(componentsPool);
    const dependentsP = componentsVersions.map(async (componentVersion: ComponentVersion) => {
      const component: Version = await componentVersion.getVersion(this.objects);
      const found = component
        .getAllDependencies()
        .find((dependency) => potentialDependencies.searchWithoutVersion(dependency.id));
      return found ? componentVersion : null;
    });
    const dependents = await Promise.all(dependentsP);
    const dependentsWithoutNull = removeNils(dependents);
    return BitIds.fromArray(dependentsWithoutNull.map((c) => c.id));
  }

  async runComponentSpecs({
    bitId,
    consumer,
    save,
    verbose,
    isolated,
    directory,
    keep,
  }: {
    bitId: BitId;
    consumer?: Consumer;
    save?: boolean;
    verbose?: boolean;
    isolated?: boolean;
    directory?: string;
    keep?: boolean;
  }): Promise<SpecsResults | undefined> {
    if (!bitId.isLocal(this.name)) {
      throw new GeneralError('cannot run specs on remote component');
    }

    const component = await this.getConsumerComponent(bitId);
    return component.runSpecs({
      scope: this,
      consumer,
      save,
      verbose,
      isolated,
      directory,
      keep,
    });
  }

  async build({
    bitId,
    save,
    consumer,
    verbose,
    directory,
    keep,
    noCache,
  }: {
    bitId: BitId;
    save?: boolean;
    consumer?: Consumer;
    verbose?: boolean;
    directory?: string;
    keep?: boolean;
    noCache?: boolean;
  }): Promise<Dists | undefined> {
    if (!bitId.isLocal(this.name)) {
      throw new GeneralError('cannot run build on remote component');
    }
    const component: Component = await this.getConsumerComponent(bitId);
    return component.build({
      scope: this,
      save,
      consumer,
      verbose,
      directory,
      keep,
      noCache,
    });
  }

  async loadModelComponentByIdStr(id: string): Promise<ModelComponent> {
    // Remove the version before hashing since hashing with the version number will result a wrong hash
    const idWithoutVersion = BitId.getStringWithoutVersion(id);
    const ref = Ref.from(BitObject.makeHash(idWithoutVersion));
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    return this.objects.load(ref);
  }

  async getParsedId(id: BitIdStr): Promise<BitId> {
    if (id.startsWith('@')) {
      throw new UnexpectedPackageName(id);
    }
    const component = await this.loadModelComponentByIdStr(id);
    const idHasScope = Boolean(component && component.scope);
    if (!idHasScope) {
      const [idWithoutVersion] = id.toString().split('@');
      if (idWithoutVersion.includes('.')) {
        // we allow . only on scope names, so if it has . it must be with scope name
        return BitId.parse(id, true);
      }
      // if it's not in the scope, it's probably new, we assume it doesn't have scope.
      return BitId.parse(id, false);
    }
    const bitId: BitId = component.toBitId();
    const version = BitId.getVersionOnlyFromString(id);
    return bitId.changeVersion(version || LATEST);
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
    return fs.remove(pendingDir); // no error is thrown if not exists
  }

  static ensure(
    path: PathOsBasedAbsolute,
    name: string | null | undefined,
    groupName: string | null | undefined
  ): Promise<Scope> {
    if (pathHasScope(path)) return this.load(path);
    const scopeJson = Scope.ensureScopeJson(path, name, groupName);
    const repository = Repository.create({ scopePath: path, scopeJson });
    return Promise.resolve(new Scope({ path, created: true, scopeJson, objects: repository }));
  }

  static ensureScopeJson(
    path: PathOsBasedAbsolute,
    name?: string | null | undefined,
    groupName?: string | null | undefined
  ): ScopeJson {
    if (!name) name = currentDirName();
    if (name === CURRENT_UPSTREAM) {
      throw new GeneralError(`the name "${CURRENT_UPSTREAM}" is a reserved word, please use another name`);
    }
    const scopeJson = new ScopeJson({ name, groupName, version: BIT_VERSION });
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
    let scopePath = propogateUntil(absPath);
    let isBare = true;
    if (!scopePath) throw new ScopeNotFound(absPath);
    if (fs.existsSync(pathLib.join(scopePath, BIT_HIDDEN_DIR))) {
      scopePath = pathLib.join(scopePath, BIT_HIDDEN_DIR);
      isBare = false;
    }
    if (
      scopePath.endsWith(pathLib.join(DOT_GIT_DIR, BIT_GIT_DIR)) ||
      scopePath.endsWith(pathLib.join(BIT_HIDDEN_DIR))
    ) {
      isBare = false;
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
    const scope = new Scope({ path: scopePath, scopeJson, objects, isBare });
    Scope.scopeCache[scopePath] = scope;
    return scope;
  }
}
