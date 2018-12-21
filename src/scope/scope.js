/** @flow */
import * as pathLib from 'path';
import semver from 'semver';
import fs from 'fs-extra';
import R from 'ramda';
import pMapSeries from 'p-map-series';
import ComponentObjects from './component-objects';
import { Symlink, Version, ModelComponent } from './models';
import types from './object-registrar';
import { propogateUntil, currentDirName, pathHasAll, first } from '../utils';
import {
  BIT_HIDDEN_DIR,
  OBJECTS_DIR,
  BITS_DIRNAME,
  BIT_VERSION,
  DEFAULT_BIT_VERSION,
  SCOPE_JSON,
  COMPONENT_ORIGINS,
  NODE_PATH_SEPARATOR
} from '../constants';
import { ScopeJson, getPath as getScopeJsonPath } from './scope-json';
import { ScopeNotFound, ComponentNotFound } from './exceptions';
import { Tmp } from './repositories';
import { BitId, BitIds } from '../bit-id';
import type ConsumerComponent from '../consumer/component';
import ComponentVersion from './component-version';
import { Repository, Ref, BitObject } from './objects';
import SourcesRepository from './repositories/sources';
import type Consumer from '../consumer/consumer';
import loader from '../cli/loader';
import type { MigrationResult } from '../migration/migration-helper';
import migratonManifest from './migrations/scope-migrator-manifest';
import migrate from './migrations/scope-migrator';
import type { ScopeMigrationResult } from './migrations/scope-migrator';
import { BEFORE_MIGRATION, BEFORE_RUNNING_BUILD, BEFORE_RUNNING_SPECS } from '../cli/loader/loader-messages';
import logger from '../logger/logger';
import type Component from '../consumer/component/consumer-component';
import { RemovedObjects } from './removed-components';
import DependencyGraph from './graph/graph';
import RemoveModelComponents from './component-ops/remove-model-components';
import Dists from '../consumer/component/sources/dists';
import SpecsResults from '../consumer/specs-results';
import { Analytics } from '../analytics/analytics';
import GeneralError from '../error/general-error';
import type { SpecsResultsWithComponentId } from '../consumer/specs-results/specs-results';
import type { PathOsBasedAbsolute } from '../utils/path';
import type { BitIdStr } from '../bit-id/bit-id';

const removeNils = R.reject(R.isNil);
const pathHasScope = pathHasAll([OBJECTS_DIR, SCOPE_JSON]);

export type ScopeDescriptor = {
  name: string
};

export type ScopeProps = {
  path: string,
  scopeJson: ScopeJson,
  created?: boolean,
  tmp?: Tmp,
  sources?: SourcesRepository,
  objects?: Repository
};

export type IsolateOptions = {
  directory: ?string,
  write_bit_dependencies: ?boolean,
  links: ?boolean,
  install_packages: ?boolean,
  installPeerDependencies: ?boolean,
  no_package_json: ?boolean,
  override: ?boolean
};

export type ComponentsAndVersions = {
  component: ModelComponent,
  version: Version,
  versionStr: string
};

export default class Scope {
  created: boolean = false;
  scopeJson: ScopeJson;
  tmp: Tmp;
  path: string;
  sources: SourcesRepository;
  objects: Repository;
  _dependencyGraph: DependencyGraph; // cache DependencyGraph instance

  constructor(scopeProps: ScopeProps) {
    this.path = scopeProps.path;
    this.scopeJson = scopeProps.scopeJson;
    this.created = scopeProps.created || false;
    this.tmp = scopeProps.tmp || new Tmp(this);
    this.sources = scopeProps.sources || new SourcesRepository(this);
    this.objects = scopeProps.objects || new Repository(this, types());
  }

  async getDependencyGraph(): Promise<DependencyGraph> {
    if (!this._dependencyGraph) {
      this._dependencyGraph = await DependencyGraph.load(this.objects);
    }
    return this._dependencyGraph;
  }

  get groupName(): ?string {
    if (!this.scopeJson.groupName) return null;
    return this.scopeJson.groupName;
  }

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
    const versions = fs.readdirSync(componentFullPath);
    const latestVersion = semver.maxSatisfying(versions, '*');
    return pathLib.join(relativePath, latestVersion);
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
    logger.debugAndAddBreadCrumb('scope.migrate', 'running migration process for scope');
    if (verbose) console.log('running migration process for scope'); // eslint-disable-line
    // We start to use this process after version 0.10.9, so we assume the scope is in the last production version
    const scopeVersion = this.scopeJson.get('version') || '0.10.9';
    if (semver.gte(scopeVersion, BIT_VERSION)) {
      const upToDateMsg = 'scope version is up to date';
      if (verbose) console.log(upToDateMsg); // eslint-disable-line
      logger.debugAndAddBreadCrumb('scope.migrate', upToDateMsg);
      return {
        run: false
      };
    }
    loader.start(BEFORE_MIGRATION);
    const rawObjects = await this.objects.listRawObjects();
    const resultObjects: ScopeMigrationResult = await migrate(scopeVersion, migratonManifest, rawObjects, verbose);
    // Add the new / updated objects
    this.objects.addMany(resultObjects.newObjects);
    // Remove old objects
    await this.objects.removeMany(resultObjects.refsToRemove);
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

  toConsumerComponents(components: ModelComponent[]): Promise<ConsumerComponent[]> {
    return Promise.all(
      components
        .filter(comp => !(comp instanceof Symlink))
        .map(c => c.toConsumerComponent(c.latestExisting(this.objects).toString(), this.name, this.objects))
    );
  }

  async list(): Promise<ModelComponent[]> {
    return this.objects.listComponents(false);
  }

  async listLocal(): Promise<ModelComponent[]> {
    const listResults = await this.list();
    return listResults.filter(result => !result.scope || result.scope === this.name);
  }

  async latestVersions(componentIds: BitId[], throwOnFailure: boolean = true): Promise<BitIds> {
    componentIds = componentIds.map(componentId => componentId.changeVersion(null));
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
   */
  async buildMultiple(
    components: Component[],
    consumer: Consumer,
    noCache: boolean,
    verbose: boolean
  ): Promise<{ component: string, buildResults: Object }> {
    logger.debugAndAddBreadCrumb('scope.buildMultiple', 'scope.buildMultiple: sequentially build multiple components');
    // Make sure to not start the loader if there are no components to build
    if (components && components.length) {
      loader.start(BEFORE_RUNNING_BUILD);
    }
    const build = async (component: Component) => {
      await component.build({ scope: this, consumer, noCache, verbose });
      const buildResults = await component.dists.writeDists(component, consumer);
      return { component: component.id.toString(), buildResults };
    };
    return pMapSeries(components, build);
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
          (component.dependencies.isCustomResolvedUsed() ||
            component.devDependencies.isCustomResolvedUsed() ||
            component.compilerDependencies.isCustomResolvedUsed() ||
            component.testerDependencies.isCustomResolvedUsed()) &&
          (component.componentMap && component.componentMap.origin === COMPONENT_ORIGINS.AUTHORED) &&
          !component.dists.isEmpty()
      );
    if (isNodePathNeeded) {
      const getCurrentNodePathWithDirDist = () => {
        if (!process.env.NODE_PATH) return nodePathDirDist;
        const separator = process.env.NODE_PATH.endsWith(NODE_PATH_SEPARATOR) ? '' : NODE_PATH_SEPARATOR;
        // $FlowFixMe
        return process.env.NODE_PATH + separator + nodePathDirDist;
      };
      process.env.NODE_PATH = getCurrentNodePathWithDirDist();
      // $FlowFixMe
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
    rejectOnFailure = false
  }: {
    components: Component[],
    consumer: Consumer,
    verbose: boolean,
    rejectOnFailure?: boolean
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
        verbose
      });
      const pass = specs ? specs.every(spec => spec.pass) : true;
      return { componentId: component.id, specs, pass };
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
  async writeManyComponentsToModel(componentsObjects: ComponentObjects[], persist: boolean = true): Promise<any> {
    const manyObjects = componentsObjects.map(componentObjects => componentObjects.toObjects(this.objects));
    logger.debugAndAddBreadCrumb(
      'scope.writeManyComponentsToModel',
      'writing into the model, ids: {ids}. They might have dependencies which are going to be written too',
      { ids: manyObjects.map(objects => objects.component.id()).join(', ') }
    );
    await Promise.all(manyObjects.map(objects => this.sources.merge(objects)));
    return persist ? this.objects.persist() : Promise.resolve();
  }

  getObject(hash: string): Promise<BitObject> {
    return new Ref(hash).load(this.objects);
  }

  getRawObject(hash: string): Promise<BitRawObject> {
    return this.objects.loadRawObject(new Ref(hash));
  }

  async getModelComponentIfExist(id: BitId): Promise<?ModelComponent> {
    return this.sources.get(id);
  }

  async deprecateSingle(bitId: BitId): Promise<string> {
    const component = await this.sources.get(bitId);
    component.deprecated = true;
    this.objects.add(component);
    await this.objects.persist();
    return bitId.toStringWithoutVersion();
  }

  /**
   * Remove components from scope
   * @force Boolean  - remove component from scope even if other components use it
   */
  async removeMany(
    bitIds: BitIds,
    force: boolean,
    removeSameOrigin: boolean = false,
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
  async findDependentBits(bitIds: BitIds, returnResultsWithVersion: boolean = false): Promise<{ [string]: BitId[] }> {
    const allComponents = await this.list();
    const allComponentVersions = await Promise.all(
      allComponents.map(async (component: ModelComponent) => {
        const loadedVersions = await Promise.all(
          Object.keys(component.versions).map(async (version) => {
            const componentVersion = await component.loadVersion(version, this.objects);
            if (!componentVersion) return;
            componentVersion.id = component.toBitId();
            return componentVersion;
          })
        );
        return loadedVersions.filter(x => x);
      })
    );
    const allScopeComponents = R.flatten(allComponentVersions);
    const dependentBits = {};
    bitIds.forEach((bitId) => {
      const dependencies = [];
      allScopeComponents.forEach((scopeComponents) => {
        scopeComponents.flattenedDependencies.forEach((flattenedDependency) => {
          if (flattenedDependency.isEqualWithoutVersion(bitId)) {
            returnResultsWithVersion
              ? dependencies.push(scopeComponents.id)
              : dependencies.push(scopeComponents.id.changeVersion(null));
          }
        });
      });

      if (!R.isEmpty(dependencies)) {
        dependentBits[bitId.toStringWithoutVersion()] = BitIds.fromArray(dependencies).getUniq();
      }
    });
    return Promise.resolve(dependentBits);
  }

  /**
   * split bit array to found and missing components (incase user misspelled id)
   */
  async filterFoundAndMissingComponents(
    bitIds: BitIds
  ): Promise<{ missingComponents: BitIds, foundComponents: BitIds }> {
    const missingComponents = new BitIds();
    const foundComponents = new BitIds();
    const resultP = bitIds.map(async (id) => {
      const component = await this.sources.get(id);
      if (!component) missingComponents.push(id);
      else foundComponents.push(id);
    });
    await Promise.all(resultP);
    return Promise.resolve({ missingComponents, foundComponents });
  }

  /**
   * deprecate components from scope
   */
  async deprecateMany(bitIds: BitIds): Promise<any> {
    logger.debug(`scope.deprecateMany, ids: ${bitIds.toString()}`);
    const { missingComponents, foundComponents } = await this.filterFoundAndMissingComponents(bitIds);
    const deprecatedComponentsP = foundComponents.map(bitId => this.deprecateSingle(bitId));
    const deprecatedComponents = await Promise.all(deprecatedComponentsP);
    const missingComponentsStrings = missingComponents.map(id => id.toStringWithoutVersion());
    return { bitIds: deprecatedComponents, missingComponents: missingComponentsStrings };
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
      return component.toComponentVersion(version);
    });
    return removeNils(components);
  }

  loadComponentLogs(id: BitId): Promise<{ [number]: { message: string, date: string, hash: string } }> {
    return this.sources.get(id).then((componentModel) => {
      if (!componentModel) throw new ComponentNotFound(id.toString());
      return componentModel.collectLogs(this.objects);
    });
  }

  loadAllVersions(id: BitId): Promise<ConsumerComponent[]> {
    return this.sources.get(id).then((componentModel) => {
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
    const component = await this.sources.get(id);
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
    const component = await this.sources.get(id);
    if (component) return component;
    if (!id.scope) {
      // search for the complete ID
      const components: ModelComponent[] = await this.list();
      const foundComponent = components.filter(c => c.toBitId().isEqualWithoutScopeAndVersion(id));
      // $FlowFixMe
      if (foundComponent.length) return first(foundComponent);
    }
    throw new ComponentNotFound(id.toString());
  }

  /**
   * throws if component was not found
   */
  async getConsumerComponent(id: BitId): Promise<ConsumerComponent> {
    const modelComponent: ModelComponent = await this.getModelComponent(id);
    // $FlowFixMe version must be set
    const componentVersion = modelComponent.toComponentVersion(id.version);
    return componentVersion.toConsumer(this.objects);
  }

  async getVersionInstance(id: BitId): Promise<Version> {
    if (!id.hasVersion()) throw new TypeError(`scope.getVersionInstance - id ${id.toString()} is missing the version`);
    const component: ModelComponent = await this.getModelComponent(id);
    // $FlowFixMe id.version is not null, was checked above
    return component.loadVersion(id.version, this.objects);
  }

  async getComponentsAndVersions(ids: BitIds): Promise<ComponentsAndVersions[]> {
    const componentsObjects = await this.sources.getMany(ids);
    const componentsAndVersionsP = componentsObjects.map(async (componentObjects) => {
      if (!componentObjects.component) return null;
      const component: ModelComponent = componentObjects.component;
      const versionStr = componentObjects.id.getVersion().toString();
      const version: Version = await component.loadVersion(versionStr, this.objects);
      return { component, version, versionStr };
    });
    const componentsAndVersions = await Promise.all(componentsAndVersionsP);
    return removeNils(componentsAndVersions);
  }

  /**
   * Creates a symlink object with the local-scope which links to the real-object of the remote-scope
   * This way, local components that have dependencies to the exported component won't break.
   */
  createSymlink(id: BitId, remote: string) {
    const symlink = new Symlink({
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

  clean(bitId: BitId): Promise<void> {
    return this.sources.clean(bitId);
  }

  /**
   * find the components in componentsPool which one of their dependencies include in potentialDependencies
   */
  async findDirectDependentComponents(
    componentsPool: BitIds,
    potentialDependencies: BitIds
  ): Promise<ComponentVersion[]> {
    const componentsVersions = await this.loadLocalComponents(componentsPool);
    const dependentsP = componentsVersions.map(async (componentVersion: ComponentVersion) => {
      const component: Version = await componentVersion.getVersion(this.objects);
      const found = component
        .getAllDependencies()
        .find(dependency => potentialDependencies.searchWithoutVersion(dependency.id));
      return found ? componentVersion : null;
    });
    const dependents = await Promise.all(dependentsP);
    return removeNils(dependents);
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
    bitId: BitId,
    consumer?: ?Consumer,
    save?: ?boolean,
    verbose?: ?boolean,
    isolated?: boolean,
    directory?: string,
    keep?: boolean
  }): Promise<?SpecsResults> {
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
    keep
  }: {
    bitId: BitId,
    save?: ?boolean,
    consumer?: Consumer,
    verbose?: ?boolean,
    directory: ?string,
    keep: ?boolean
  }): Promise<?Dists> {
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
      keep
    });
  }

  async loadModelComponentByIdStr(id: string): Promise<Component> {
    // Remove the version before hashing since hashing with the version number will result a wrong hash
    const idWithoutVersion = BitId.getStringWithoutVersion(id);
    const ref = Ref.from(BitObject.makeHash(idWithoutVersion));
    // $FlowFixMe
    return this.objects.load(ref);
  }

  /**
   * if it's not in the scope, it's probably new, we assume it doesn't have scope.
   */
  async isIdHasScope(id: BitIdStr): Promise<boolean> {
    const component = await this.loadModelComponentByIdStr(id);
    return Boolean(component && component.scope);
  }

  async getParsedId(id: BitIdStr): Promise<BitId> {
    const idHasScope = await this.isIdHasScope(id);
    return BitId.parse(id, idHasScope);
  }

  static ensure(path: PathOsBasedAbsolute, name: ?string, groupName: ?string): Promise<Scope> {
    if (pathHasScope(path)) return this.load(path);
    if (!name) name = currentDirName();
    const scopeJson = new ScopeJson({ name, groupName, version: BIT_VERSION });
    return Promise.resolve(new Scope({ path, created: true, scopeJson }));
  }

  static async reset(path: PathOsBasedAbsolute, resetHard: boolean): Promise<void> {
    if (resetHard) {
      logger.info(`deleting the whole scope at ${path}`);
      await fs.emptyDir(path);
    }
  }

  static async load(absPath: string): Promise<Scope> {
    let scopePath = propogateUntil(absPath);
    if (!scopePath) throw new ScopeNotFound();
    if (fs.existsSync(pathLib.join(scopePath, BIT_HIDDEN_DIR))) {
      scopePath = pathLib.join(scopePath, BIT_HIDDEN_DIR);
    }
    const path = scopePath;

    const scopeJson = await ScopeJson.loadFromFile(getScopeJsonPath(scopePath));
    return new Scope({ path, scopeJson });
  }
}
