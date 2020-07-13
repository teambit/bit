import * as pathLib from 'path';
import semver from 'semver';
import fs from 'fs-extra';
import R from 'ramda';
import pMapSeries from 'p-map-series';
import ComponentObjects from './component-objects';
import { Symlink, Version, ModelComponent } from './models';
import { propogateUntil, currentDirName, pathHasAll, first, readDirSyncIgnoreDsStore } from '../utils';
import {
  BIT_HIDDEN_DIR,
  OBJECTS_DIR,
  BITS_DIRNAME,
  BIT_VERSION,
  DEFAULT_BIT_VERSION,
  SCOPE_JSON,
  COMPONENT_ORIGINS,
  NODE_PATH_SEPARATOR,
  CURRENT_UPSTREAM,
  LATEST
} from '../constants';
import { ScopeJson, getPath as getScopeJsonPath } from './scope-json';
import { ScopeNotFound, ComponentNotFound } from './exceptions';
import { Tmp } from './repositories';
import { BitId, BitIds } from '../bit-id';
import ComponentVersion from './component-version';
import { Repository, Ref, BitObject, BitRawObject } from './objects';
import SourcesRepository from './repositories/sources';
import Consumer from '../consumer/consumer';
import loader from '../cli/loader';
import { MigrationResult } from '../migration/migration-helper';
import migratonManifest from './migrations/scope-migrator-manifest';
import migrate from './migrations/scope-migrator';
import { ScopeMigrationResult } from './migrations/scope-migrator';
import { BEFORE_MIGRATION, BEFORE_RUNNING_BUILD, BEFORE_RUNNING_SPECS } from '../cli/loader/loader-messages';
import logger from '../logger/logger';
import Component from '../consumer/component/consumer-component';
import RemovedObjects from './removed-components';
import DependencyGraph from './graph/scope-graph';
import RemoveModelComponents from './component-ops/remove-model-components';
import Dists from '../consumer/component/sources/dists';
import SpecsResults from '../consumer/specs-results';
import { Analytics } from '../analytics/analytics';
import GeneralError from '../error/general-error';
import { SpecsResultsWithComponentId } from '../consumer/specs-results/specs-results';
import { PathOsBasedAbsolute } from '../utils/path';
import { BitIdStr } from '../bit-id/bit-id';
import { ComponentLogs } from './models/model-component';
import ScopeComponentsImporter from './component-ops/scope-components-importer';
import VersionDependencies from './version-dependencies';

const removeNils = R.reject(R.isNil);
const pathHasScope = pathHasAll([OBJECTS_DIR, SCOPE_JSON]);

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

export default class Scope {
  created = false;
  scopeJson: ScopeJson;
  tmp: Tmp;
  path: string;
  scopeImporter: ScopeComponentsImporter;
  sources: SourcesRepository;
  objects: Repository;
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  _dependencyGraph: DependencyGraph; // cache DependencyGraph instance

  constructor(scopeProps: ScopeProps) {
    this.path = scopeProps.path;
    this.scopeJson = scopeProps.scopeJson;
    this.created = scopeProps.created || false;
    this.tmp = scopeProps.tmp || new Tmp(this);
    this.sources = scopeProps.sources || new SourcesRepository(this);
    this.objects = scopeProps.objects;
    this.scopeImporter = ScopeComponentsImporter.getInstance(this);
  }

  public onTag: Function[] = []; // enable extensions to hook during the tag process
  public onPostExport: Function[] = []; // enable extensions to hook during the tag process

  /**
   * import components to the `Scope.
   */
  async import(ids: BitIds, cache = true, persist = true): Promise<VersionDependencies[]> {
    return this.scopeImporter.importMany(ids, cache, persist);
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

  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  get name(): string {
    return this.scopeJson.name;
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
    logger.silly('scope.migrate, running migration process for scope');
    if (verbose) console.log('running migration process for scope'); // eslint-disable-line
    // We start to use this process after version 0.10.9, so we assume the scope is in the last production version
    const scopeVersion = this.scopeJson.get('version') || '0.10.9';
    if (semver.gte(scopeVersion, BIT_VERSION)) {
      const upToDateMsg = 'scope version is up to date';
      if (verbose) console.log(upToDateMsg); // eslint-disable-line
      logger.silly(`scope.migrate, ${upToDateMsg}`);
      return {
        run: false
      };
    }
    loader.start(BEFORE_MIGRATION);
    logger.debugAndAddBreadCrumb(
      'scope.migrate',
      `start scope migration. scope version ${scopeVersion}, bit version ${BIT_VERSION}`
    );
    const rawObjects = await this.objects.listRawObjects();
    const resultObjects: ScopeMigrationResult = await migrate(scopeVersion, migratonManifest, rawObjects, verbose);
    // Add the new / updated objects
    this.objects.addMany(resultObjects.newObjects);
    // Remove old objects
    this.objects.removeManyObjects(resultObjects.refsToRemove);
    // Persists new / remove objects
    const validateBeforePersist = false;
    await this.objects.persist(validateBeforePersist);
    // Update the scope version
    this.scopeJson.set('version', BIT_VERSION);
    logger.debugAndAddBreadCrumb('scope.migrate', `updating scope version to version ${BIT_VERSION}`);
    await this.scopeJson.write(this.getPath());
    loader.stop();
    return {
      run: true,
      success: true
    };
  }

  describe(): ScopeDescriptor {
    return {
      name: this.name
    };
  }

  toConsumerComponents(components: ModelComponent[]): Promise<Component[]> {
    return Promise.all(
      components
        .filter(comp => !(comp instanceof Symlink))
        // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
        .map(c => c.toConsumerComponent(c.latestExisting(this.objects).toString(), this.name, this.objects))
    );
  }

  async list(): Promise<ModelComponent[]> {
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    return this.objects.listComponents();
  }

  async listIncludesSymlinks(): Promise<Array<ModelComponent | Symlink>> {
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    return this.objects.listComponentsIncludeSymlinks();
  }

  async listLocal(): Promise<ModelComponent[]> {
    const listResults = await this.list();
    return listResults.filter(result => !result.scope || result.scope === this.name);
  }

  async latestVersions(componentIds: BitId[], throwOnFailure = true): Promise<BitIds> {
    componentIds = componentIds.map(componentId => componentId.changeVersion(undefined));
    const components = await this.sources.getMany(componentIds);
    const ids = components.map(component => {
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
  ): Promise<{ component: string; buildResults: Record<string, any> }> {
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

    const buildResults = await pMapSeries(components, build);
    await pMapSeries(components, writeLinks);
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
        component =>
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
    rejectOnFailure = false
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
        dontPrintEnvMsg
      });
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      const pass = specs ? specs.every(spec => spec.pass) : true;
      const missingDistSpecs = specs && R.isEmpty(specs);
      return { componentId: component.id, missingDistSpecs, specs, pass };
    };
    return pMapSeries(components, test);
  }

  /**
   * Writes a component as an object into the 'objects' directory
   */
  writeComponentToModel(componentObjects: ComponentObjects): Promise<any> {
    const objects = componentObjects.toObjects(this.objects);
    logger.debugAndAddBreadCrumb(
      'writeComponentToModel',
      'writing into the model, Main id: {id}. It might have dependencies which are going to be written too',
      { id: objects.component.id().toString() }
    );
    return this.sources.merge(objects).then(() => this.objects.persist());
  }

  /**
   * Writes components as objects into the 'objects' directory
   */
  async writeManyComponentsToModel(componentsObjects: ComponentObjects[], persist = true): Promise<any> {
    logger.debugAndAddBreadCrumb(
      'scope.writeManyComponentsToModel',
      `total componentsObjects ${componentsObjects.length}`
    );
    await pMapSeries(componentsObjects, componentObjects =>
      componentObjects.toObjectsAsync(this.objects).then(objects => this.sources.merge(objects))
    );
    return persist ? this.objects.persist() : Promise.resolve();
  }

  getObject(hash: string): Promise<BitObject> {
    return new Ref(hash).load(this.objects);
  }

  getRawObject(hash: string): Promise<BitRawObject> {
    return this.objects.loadRawObject(new Ref(hash));
  }

  async getModelComponentIfExist(id: BitId): Promise<ModelComponent | undefined> {
    return this.sources.get(id);
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
        const loadedVersions = await Promise.all(
          Object.keys(component.versions).map(async version => {
            const componentVersion = await component.loadVersion(version, this.objects);
            if (!componentVersion) return null;
            // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
            componentVersion.id = component.toBitId();
            return componentVersion;
          })
        );
        return loadedVersions.filter(x => x);
      })
    );
    const allScopeComponents = R.flatten(allComponentVersions);
    const dependentBits = {};
    bitIds.forEach(bitId => {
      const dependencies = [];
      allScopeComponents.forEach(scopeComponents => {
        scopeComponents.flattenedDependencies.forEach(flattenedDependency => {
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
    const resultP = bitIds.map(async id => {
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
    const components = componentsObjects.map(componentObject => {
      const component = componentObject.component;
      if (!component) return null;
      const version = componentObject.id.hasVersion() ? componentObject.id.version : component.latest();
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      return component.toComponentVersion(version);
    });
    return removeNils(components);
  }

  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  loadComponentLogs(id: BitId): Promise<ComponentLogs> {
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    return this.getModelComponent(id).then(componentModel => {
      return componentModel.collectLogs(this.objects);
    });
  }

  loadAllVersions(id: BitId): Promise<Component[]> {
    return this.getModelComponentIfExist(id).then(componentModel => {
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
    if (component) return component;
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
      const foundComponent = components.filter(c => c.toBitId().isEqualWithoutScopeAndVersion(id));
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
    return Promise.all(ids.map(id => this.getConsumerComponent(id)));
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
    // $FlowFixMe id.version is not null, was checked above
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    return component.loadVersion(id.version, this.objects);
  }

  async getComponentsAndVersions(ids: BitIds, defaultToLatestVersion = false): Promise<ComponentsAndVersions[]> {
    const componentsObjects = await this.sources.getMany(ids);
    const componentsAndVersionsP = componentsObjects.map(async componentObjects => {
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
    const componentsAndVersionsP = componentsObjects.map(async componentObjects => {
      if (!componentObjects.component) return null;
      const component: ModelComponent = componentObjects.component;
      const localVersions = component.getLocalVersions();
      return Promise.all(
        localVersions.map(async versionStr => {
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
      realScope: remote
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
        .find(dependency => potentialDependencies.searchWithoutVersion(dependency.id));
      return found ? componentVersion : null;
    });
    const dependents = await Promise.all(dependentsP);
    const dependentsWithoutNull = removeNils(dependents);
    return BitIds.fromArray(dependentsWithoutNull.map(c => c.id));
  }

  async runComponentSpecs({
    bitId,
    consumer,
    save,
    verbose,
    isolated,
    directory,
    keep
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
      keep
    });
  }

  async build({
    bitId,
    save,
    consumer,
    verbose,
    directory,
    keep,
    noCache
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
      noCache
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
    const component = await this.loadModelComponentByIdStr(id);
    const idHasScope = Boolean(component && component.scope);
    if (!idHasScope) {
      // if it's not in the scope, it's probably new, we assume it doesn't have scope.
      return BitId.parse(id, false);
    }
    const bitId: BitId = component.toBitId();
    const version = BitId.getVersionOnlyFromString(id);
    return bitId.changeVersion(version || LATEST);
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
    const scope = new Scope({ path: scopePath, scopeJson, objects });
    Scope.scopeCache[scopePath] = scope;
    return scope;
  }
}
