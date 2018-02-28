/** @flow */
import * as pathLib from 'path';
import semver from 'semver';
import fs from 'fs-extra';
import R, { merge, splitWhen } from 'ramda';
import chalk from 'chalk';
import Toposort from 'toposort-class';
import pMapSeries from 'p-map-series';
import { GlobalRemotes } from '../global-config';
import enrichContextFromGlobal from '../hooks/utils/enrich-context-from-global';
import { flattenDependencyIds } from './flatten-dependencies';
import ComponentObjects from './component-objects';
import ComponentModel from './models/component';
import Source from './models/source';
import { Symlink, Version } from './models';
import { Remotes } from '../remotes';
import types from './object-registrar';
import { propogateUntil, currentDirName, pathHas, first, readFile, splitBy, pathNormalizeToLinux } from '../utils';
import {
  BIT_HIDDEN_DIR,
  LATEST,
  OBJECTS_DIR,
  BITS_DIRNAME,
  BIT_VERSION,
  DEFAULT_BIT_VERSION,
  LATEST_BIT_VERSION
} from '../constants';
import { ScopeJson, getPath as getScopeJsonPath } from './scope-json';
import {
  ScopeNotFound,
  ComponentNotFound,
  ResolutionException,
  DependencyNotFound,
  CyclicDependencies
} from './exceptions';
import IsolatedEnvironment from '../environment';
import { RemoteScopeNotFound, PermissionDenied } from './network/exceptions';
import { Tmp } from './repositories';
import { BitId, BitIds } from '../bit-id';
import ConsumerComponent from '../consumer/component';
import ComponentVersion from './component-version';
import { Repository, Ref, BitObject } from './objects';
import ComponentWithDependencies from './component-dependencies';
import VersionDependencies from './version-dependencies';
import SourcesRepository from './repositories/sources';
import Consumer from '../consumer/consumer';
import { index } from '../search/indexer';
import loader from '../cli/loader';
import { MigrationResult } from '../migration/migration-helper';
import migratonManifest from './migrations/scope-migrator-manifest';
import migrate, { ScopeMigrationResult } from './migrations/scope-migrator';
import {
  BEFORE_PERSISTING_PUT_ON_SCOPE,
  BEFORE_IMPORT_PUT_ON_SCOPE,
  BEFORE_MIGRATION,
  BEFORE_RUNNING_BUILD,
  BEFORE_RUNNING_SPECS
} from '../cli/loader/loader-messages';
import performCIOps from './ci-ops';
import logger from '../logger/logger';
import componentResolver from '../component-resolver';
import ComponentsList from '../consumer/component/components-list';
import Component from '../consumer/component/consumer-component';
import { RemovedObjects } from './removed-components';
import DependencyGraph from './graph/graph';
import RemoveModelComponents from './component-ops/remove-model-components';

const removeNils = R.reject(R.isNil);
const pathHasScope = pathHas([OBJECTS_DIR, BIT_HIDDEN_DIR]);

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
  no_package_json: ?boolean,
  override: ?boolean
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

  async getDependencyGraph(): DependencyGraph {
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
   * Get the releative components path inside the scope
   * (components such as compilers / testers / extensions)
   * currently components
   */
  static getComponentsRelativePath(): string {
    return BITS_DIRNAME;
  }

  /**
   * Get a relative (to scope) path to a specific component such as compiler / tester / extension
   * @param {BitId} id
   */
  static getComponentRelativePath(id: BitId): string {
    return pathLib.join(id.box, id.name, id.scope, id.version);
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
  async migrate(verbose): MigrationResult {
    logger.debug('running migration process for scope');
    if (verbose) console.log('running migration process for scope'); // eslint-disable-line
    // We start to use this process after version 0.10.9, so we assume the scope is in the last production version
    const scopeVersion = this.scopeJson.get('version') || '0.10.9';
    if (semver.gte(scopeVersion, BIT_VERSION)) {
      logger.debug('scope version is up to date');
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
    await this.objects.persist();
    // Update the scope version
    this.scopeJson.set('version', BIT_VERSION);
    logger.debug(`updating scope version to version ${BIT_VERSION}`);
    await this.scopeJson.write(this.getPath());
    return {
      run: true,
      success: true
    };
  }

  remotes(): Promise<Remotes> {
    const self = this;
    function mergeRemotes(globalRemotes: GlobalRemotes) {
      const globalObj = globalRemotes.toPlainObject();
      return Remotes.load(merge(globalObj, self.scopeJson.remotes));
    }

    return GlobalRemotes.load().then(mergeRemotes);
  }

  describe(): ScopeDescriptor {
    return {
      name: this.name
    };
  }

  toConsumerComponents(components: ComponentModel[]): Promise<ConsumerComponent[]> {
    return Promise.all(
      components
        .filter(comp => !(comp instanceof Symlink))
        .map(c => c.toConsumerComponent(c.latestExisting(this.objects).toString(), this.name, this.objects))
    );
  }

  async list(showRemoteVersion?: boolean = false) {
    const components = await this.objects.listComponents();
    const consumerComponents = await this.toConsumerComponents(components);
    if (showRemoteVersion) {
      const componentsIds = consumerComponents.map(component => component.id);
      const latestVersionsInfo = await this.fetchRemoteVersions(componentsIds);
      latestVersionsInfo.forEach((componentId) => {
        const component = consumerComponents.find(
          c => c.id.toStringWithoutVersion() === componentId.toStringWithoutVersion()
        );
        component.latest = componentId.version;
      });
    }
    return ComponentsList.sortComponentsByName(consumerComponents);
  }

  async listStage() {
    const components = await this.objects.listComponents(false);
    const scopeComponents = await this.toConsumerComponents(components.filter(c => !c.scope || c.scope === this.name));
    return ComponentsList.sortComponentsByName(scopeComponents);
  }

  async fetchRemoteVersions(componentIds: BitId[]): Promise<BitId[]> {
    const externals = componentIds.filter(id => !id.isLocal(this.name));
    const remotes = await this.remotes();
    return remotes.latestVersions(externals, this);
  }

  async latestVersions(componentIds: BitId[], throwOnFailure: boolean = true): Promise<BitId[]> {
    componentIds = componentIds.map(componentId => BitId.parse(componentId.toStringWithoutVersion()));
    const components = await this.sources.getMany(componentIds);
    return components.map((component) => {
      const componentId = BitId.parse(component.id.toString());
      if (component.component) {
        componentId.version = component.component.latest();
      } else {
        if (throwOnFailure) throw new ComponentNotFound(component.id.toString());
        componentId.version = DEFAULT_BIT_VERSION;
      }
      return componentId;
    });
  }

  importDependencies(dependencies: BitId[]) {
    return new Promise((resolve, reject) => {
      return this.importMany(dependencies)
        .then(resolve)
        .catch((e) => {
          logger.error(`importDependencies got an error: ${JSON.stringify(e)}`);
          if (e instanceof RemoteScopeNotFound || e instanceof PermissionDenied) return reject(e);
          return reject(new DependencyNotFound(e.id));
        });
    });
  }

  async putMany({
    consumerComponents,
    message,
    exactVersion,
    releaseType,
    force,
    consumer,
    verbose
  }: {
    consumerComponents: ConsumerComponent[],
    message: string,
    exactVersion: ?string,
    releaseType: string,
    force: ?boolean,
    consumer: Consumer,
    verbose: ?boolean
  }): Promise<ComponentWithDependencies> {
    // TODO: Change the return type
    loader.start(BEFORE_IMPORT_PUT_ON_SCOPE);
    const topSort = new Toposort();
    const allDependencies = new Map();
    const consumerComponentsIdsMap = new Map();
    // Concat and unique all the dependencies from all the components so we will not import
    // the same dependency more then once, it's mainly for performance purpose
    consumerComponents.forEach((consumerComponent) => {
      const componentIdString = consumerComponent.id.toString();
      // Store it in a map so we can take it easily from the sorted array which contain only the id
      consumerComponentsIdsMap.set(componentIdString, consumerComponent);
      const dependenciesIdsStrings = consumerComponent.getAllDependencies().map(dependency => dependency.id.toString());
      topSort.add(componentIdString, dependenciesIdsStrings || []);
    });

    let sortedConsumerComponentsIds;
    // Sort the consumerComponents by the dependency order so we can commit those without the dependencies first
    try {
      sortedConsumerComponentsIds = topSort.sort().reverse();
    } catch (e) {
      throw new CyclicDependencies(e);
    }

    const getFlattenForDependency = async (dependency, cache) => {
      // Try to get the flatten dependencies from cache
      let flattenedDependencies = cache.get(dependency.id.toString());
      if (flattenedDependencies) return Promise.resolve(flattenedDependencies);

      // Calculate the flatten dependencies
      if (
        consumerComponentsIdsMap.has(dependency.id.toStringWithoutVersion()) ||
        consumerComponentsIdsMap.has(dependency.id.toString())
      ) {
        // when a dependency includes in the components list to tag, don't use the existing version, because the
        // existing version will be obsolete once it's tagged. Instead, remove the version, and later on, when
        // importDependencies is called, it'll fetch the newly tagged version.
        dependency.id.version = undefined;
      }
      const versionDependencies = await this.importDependencies([dependency.id]);
      // Copy the exact version from flattenedDependency to dependencies
      if (!dependency.id.hasVersion()) {
        dependency.id.version = first(versionDependencies).component.version;
      }

      flattenedDependencies = await flattenDependencyIds(versionDependencies, this.objects);

      // Store the flatten dependencies in cache
      cache.set(dependency.id.toString(), flattenedDependencies);

      return flattenedDependencies;
    };

    const getFlattenForComponent = async (consumerComponent, cache, dev = false) => {
      const dependencies = dev ? consumerComponent.devDependencies : consumerComponent.dependencies;
      const flattenedDependenciesP = dependencies.get().map(dependency => getFlattenForDependency(dependency, cache));
      let flattenedDependencies = await Promise.all(flattenedDependenciesP);
      flattenedDependencies = R.flatten(flattenedDependencies);
      const predicate = id => id.toString(); // TODO: should be moved to BitId class
      return R.uniqBy(predicate)(flattenedDependencies);
    };

    logger.debug('scope.putMany: sequentially build all components');
    const componentsToBuild = sortedConsumerComponentsIds.map(id => consumerComponentsIdsMap.get(id)).filter(c => c);
    await this.buildMultiple(componentsToBuild, consumer, verbose);

    logger.debug('scope.putMany: sequentially test all components');
    const testsResults = await this.testMultiple(componentsToBuild, consumer, verbose, !force);

    logger.debug('scope.putMany: sequentially persist all components');
    const persistComponentsP = sortedConsumerComponentsIds.map(consumerComponentId => async () => {
      const consumerComponent = consumerComponentsIdsMap.get(consumerComponentId);
      // This happens when there is a dependency which have been already committed
      if (!consumerComponent) return Promise.resolve([]);
      const flattenedDependencies = await getFlattenForComponent(consumerComponent, allDependencies);
      const flattenedDevDependencies = await getFlattenForComponent(consumerComponent, allDependencies, true);

      // when a component is written to the filesystem, the originallySharedDir may be stripped, if it was, the
      // originallySharedDir is written in bit.map, and then set in consumerComponent.originallySharedDir when loaded.
      // similarly, when the dists are written to the filesystem, the dist.entry may be stripped, if it was, the
      // consumerComponent.dists.distEntryShouldBeStripped is set to true.
      // because the model always has the paths of the original author, in case part of the path was stripped, add it
      // back before saving to the model. this way, when the author updates the components, the paths will be correct.
      const addSharedDirAndDistEntry = (pathStr) => {
        const withSharedDir = consumerComponent.originallySharedDir
          ? pathLib.join(consumerComponent.originallySharedDir, pathStr)
          : pathStr;
        const withDistEntry = consumerComponent.dists.distEntryShouldBeStripped
          ? pathLib.join(consumer.bitJson.distEntry, withSharedDir)
          : withSharedDir;
        return pathNormalizeToLinux(withDistEntry);
      };
      const dists = !consumerComponent.dists.isEmpty()
        ? consumerComponent.dists.get().map((dist) => {
          return {
            name: dist.basename,
            relativePath: addSharedDirAndDistEntry(dist.relative),
            file: Source.from(dist.contents),
            test: dist.test
          };
        })
        : null;

      const testResult = testsResults.find(result => result.component.id.toString() === consumerComponentId);

      const component = await this.sources.addSource({
        source: consumerComponent,
        flattenedDependencies,
        flattenedDevDependencies,
        message,
        exactVersion,
        releaseType,
        dists,
        specsResults: testResult ? testResult.specs : undefined
      });
      const deps = await component.toVersionDependencies(LATEST, this, this.name);
      consumerComponent.version = deps.component.version;
      await deps.toConsumer(this.objects);
      // await index(consumerComponent, this.getPath());
      return consumerComponent;
    });

    // Run the persistence one by one not in parallel!
    loader.start(BEFORE_PERSISTING_PUT_ON_SCOPE);
    const components = await persistComponentsP.reduce(
      (promise, func) => promise.then(result => func().then(Array.prototype.concat.bind(result))),
      Promise.resolve([])
    );
    await this.objects.persist();

    return components;
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
    verbose
  ): Promise<{ component: string, buildResults: Object }> {
    logger.debug('scope.buildMultiple: sequentially build multiple components');
    loader.start(BEFORE_RUNNING_BUILD);
    const build = async (component: Component) => {
      await component.build({ scope: this, consumer, verbose });
      const buildResults = await component.dists.writeDists(component, consumer);
      return { component: component.id.toString(), buildResults };
    };
    return pMapSeries(components, build);
  }

  /**
   * Test multiple components sequentially, not in parallel.
   *
   * See the reason not to run them in parallel at @buildMultiple()
   */
  async testMultiple(
    components: Component[],
    consumer: Consumer,
    verbose: boolean,
    rejectOnFailure: boolean
  ): Promise<{ component: Component, specsResults: Object }> {
    logger.debug('scope.testMultiple: sequentially test multiple components');
    loader.start(BEFORE_RUNNING_SPECS);
    const test = async (component) => {
      if (!component.testerId) {
        return { component, missingTester: true };
      }
      const specs = await component.runSpecs({
        scope: this,
        rejectOnFailure,
        consumer,
        verbose
      });
      return { component, specs };
    };
    return pMapSeries(components, test);
  }

  /**
   * Writes a component as an object into the 'objects' directory
   */
  writeComponentToModel(componentObjects: ComponentObjects): Promise<any> {
    const objects = componentObjects.toObjects(this.objects);
    logger.debug(
      `writeComponentToModel, writing into the model, Main id: ${objects.component.id()}. It might have dependencies which are going to be written too`
    );
    return this.sources.merge(objects).then(() => this.objects.persist());
  }

  /**
   * Writes components as objects into the 'objects' directory
   */
  async writeManyComponentsToModel(componentsObjects: ComponentObjects[], persist: boolean = true): Promise<any> {
    const manyObjects = componentsObjects.map(componentObjects => componentObjects.toObjects(this.objects));
    logger.debug(
      `writeComponentToModel, writing into the model, ids: ${manyObjects
        .map(objects => objects.component.id())
        .join(', ')}. They might have dependencies which are going to be written too`
    );
    await Promise.all(manyObjects.map(objects => this.sources.merge(objects)));
    return persist ? this.objects.persist() : Promise.resolve();
  }

  /**
   * When exporting components with dependencies to a bare-scope, some of the dependencies may be created locally and as
   * as result their scope-name is null. Once the bare-scope gets the components, it needs to convert these scope names
   * to the bare-scope name.
   * Since the changes it does affect the Version objects, the version REF of a component, needs to be changed as well.
   */
  _convertNonScopeToCorrectScope(
    componentsObjects: { component: BitObject, objects: BitObject[] },
    remoteScope: string
  ): void {
    const changeScopeIfNeeded = (dependencyId) => {
      if (!dependencyId.scope) {
        const depId = ComponentModel.fromBitId(dependencyId);
        // todo: use 'load' for async and switch the foreach with map.
        const dependencyObject = this.objects.loadSync(depId.hash());
        if (dependencyObject instanceof Symlink) {
          dependencyId.scope = dependencyObject.realScope;
        } else {
          dependencyId.scope = remoteScope;
        }
      }
    };

    componentsObjects.objects.forEach((object: Version) => {
      if (object instanceof Version) {
        const hashBefore = object.hash().toString();
        object.getAllDependencies().forEach((dependency) => {
          changeScopeIfNeeded(dependency.id);
        });
        object.getAllFlattenedDependencies().forEach((dependency) => {
          changeScopeIfNeeded(dependency);
        });
        const hashAfter = object.hash().toString();
        if (hashBefore !== hashAfter) {
          logger.debug(`switching ${componentsObjects.component.id()} version hash from ${hashBefore} to ${hashAfter}`);
          const versions = componentsObjects.component.versions;
          Object.keys(versions).forEach((version) => {
            if (versions[version].toString() === hashBefore) {
              versions[version] = Ref.from(hashAfter);
            }
          });
        }
      }
    });

    componentsObjects.component.scope = remoteScope;
  }

  /**
   * @TODO there is no real difference between bare scope and a working directory scope - let's adjust terminology to avoid confusions in the future
   * saves a component into the objects directory of the remote scope, then, resolves its
   * dependencies, saves them as well. Finally runs the build process if needed on an isolated
   * environment.
   */
  async exportManyBareScope(componentsObjects: ComponentObjects[]): Promise<string[]> {
    logger.debug(`exportManyBareScope: Going to save ${componentsObjects.length} components`);
    const manyObjects = componentsObjects.map(componentObjects => componentObjects.toObjects(this.objects));
    await Promise.all(manyObjects.map(objects => this.sources.merge(objects, true, false)));
    const manyCompVersions = await Promise.all(
      manyObjects.map(objects => objects.component.toComponentVersion(LATEST))
    );
    logger.debug('exportManyBareScope: will try to importMany in case there are missing dependencies');
    const versions = await this.importMany(manyCompVersions.map(compVersion => compVersion.id), undefined, true, false); // resolve dependencies
    logger.debug('exportManyBareScope: successfully ran importMany');
    await this.objects.persist();
    await Promise.all(versions.map(version => version.toObjects(this.objects)));
    const manyConsumerComponent = await Promise.all(
      manyCompVersions.map(compVersion => compVersion.toConsumer(this.objects))
    );
    // await Promise.all(manyConsumerComponent.map(consumerComponent => index(consumerComponent, this.getPath())));
    const ids = manyConsumerComponent.map(consumerComponent => consumerComponent.id.toString());
    await Promise.all(manyConsumerComponent.map(consumerComponent => performCIOps(consumerComponent, this.getPath())));
    return ids;
  }

  getExternalOnes(ids: BitId[], remotes: Remotes, localFetch: boolean = false, context: Object = {}) {
    logger.debug(`getExternalOnes, ids: ${ids.join(', ')}`);
    enrichContextFromGlobal(context);
    return this.sources.getMany(ids).then((defs) => {
      const left = defs.filter((def) => {
        if (!localFetch) return true;
        if (!def.component) return true;
        return false;
      });

      if (left.length === 0) {
        logger.debug('getExternalOnes: no more ids left, all found locally, existing the method');
        return Promise.all(defs.map(def => def.component.toComponentVersion(def.id.version)));
      }

      logger.debug(`getExternalOnes: ${left.length} left. Fetching them from a remote`);
      return remotes
        .fetch(left.map(def => def.id), this, true, context)
        .then((componentObjects) => {
          return this.writeManyComponentsToModel(componentObjects);
        })
        .then(() => this.getExternalOnes(ids, remotes, true));
    });
  }

  /**
   * If found locally, use them. Otherwise, fetch from remote and then, save into the model.
   */
  getExternalMany(
    ids: BitId[],
    remotes: Remotes,
    localFetch: boolean = true,
    persist: boolean = true,
    context: Object = {}
  ): Promise<VersionDependencies[]> {
    logger.debug(
      `getExternalMany, planning on fetching from ${localFetch ? 'local' : 'remote'} scope. Ids: ${ids.join(', ')}`
    );
    enrichContextFromGlobal(context);
    return this.sources.getMany(ids).then((defs) => {
      const left = defs.filter((def) => {
        if (!localFetch) return true;
        if (!def.component) return true;
        return false;
      });

      if (left.length === 0) {
        logger.debug('getExternalMany: no more ids left, all found locally, existing the method');
        // $FlowFixMe - there should be a component because there no defs without components left.
        return Promise.all(defs.map(def => def.component.toVersionDependencies(def.id.version, this, def.id.scope)));
      }

      logger.debug(`getExternalMany: ${left.length} left. Fetching them from a remote`);
      return remotes
        .fetch(left.map(def => def.id), this, undefined, context)
        .then((componentObjects) => {
          logger.debug('getExternalMany: writing them to the model');
          return this.writeManyComponentsToModel(componentObjects, persist);
        })
        .then(() => this.getExternalMany(ids, remotes));
    });
  }

  /**
   * If the component is not in the local scope, fetch it from a remote and save into the local
   * scope. (objects directory).
   */
  getExternal({
    id,
    remotes,
    localFetch = true,
    context = {}
  }: {
    id: BitId,
    remotes: Remotes,
    localFetch: boolean,
    context: Object
  }): Promise<VersionDependencies> {
    enrichContextFromGlobal(context);
    return this.sources.get(id).then((component) => {
      if (component && localFetch) {
        return component.toVersionDependencies(id.version, this, id.scope);
      }

      return remotes
        .fetch([id], this, undefined, context)
        .then(([componentObjects]) => {
          return this.writeComponentToModel(componentObjects);
        })
        .then(() => this.getExternal({ id, remotes, localFetch: true }));
    });
  }

  getExternalOne({
    id,
    remotes,
    localFetch = true,
    context = {}
  }: {
    id: BitId,
    remotes: Remotes,
    localFetch: boolean,
    context: Object
  }) {
    return this.sources.get(id).then((component) => {
      if (component && localFetch) return component.toComponentVersion(id.version);
      return remotes
        .fetch([id], this, true, context)
        .then(([componentObjects]) => this.writeComponentToModel(componentObjects))
        .then(() => this.getExternal({ id, remotes, localFetch: true }));
    });
  }

  async getObjects(ids: BitId[], withDevDependencies?: boolean): Promise<ComponentObjects[]> {
    const versions = await this.importMany(ids, withDevDependencies);
    return Promise.all(versions.map(version => version.toObjects(this.objects)));
  }

  getObject(hash: string): Promise<BitObject> {
    return new Ref(hash).load(this.objects);
  }

  getRawObject(hash: string): Promise<BitRawObject> {
    return this.objects.loadRawObject(new Ref(hash));
  }

  /**
   * 1. Local objects, fetch from local. (done by this.sources.getMany method)
   * 2. Fetch flattened dependencies (done by toVersionDependencies method). If they're not locally, fetch from remote
   * and save them locally.
   * 3. External objects, fetch from a remote and save locally. (done by this.getExternalOnes method).
   */
  async importMany(
    ids: BitIds,
    withEnvironments?: boolean,
    cache: boolean = true,
    persist: boolean = true
  ): Promise<VersionDependencies[]> {
    logger.debug(`scope.importMany: ${ids.join(', ')}`);
    const idsWithoutNils = removeNils(ids);
    if (R.isEmpty(idsWithoutNils)) return Promise.resolve([]);

    const [externals, locals] = splitWhen(id => id.isLocal(this.name), idsWithoutNils);

    const localDefs = await this.sources.getMany(locals);
    const versionDeps = await Promise.all(
      localDefs.map((def) => {
        if (!def.component) throw new ComponentNotFound(def.id.toString());
        return def.component.toVersionDependencies(def.id.version, this, def.id.scope, withEnvironments);
      })
    );
    logger.debug(
      'scope.importMany: successfully fetched local components and their dependencies. Going to fetch externals'
    );
    const remotes = await this.remotes();
    const externalDeps = await this.getExternalMany(externals, remotes, cache, persist);
    return versionDeps.concat(externalDeps);
  }

  async importManyOnes(ids: BitId[], cache: boolean): Promise<ComponentVersion[]> {
    logger.debug(`scope.importManyOnes. Ids: ${ids.join(', ')}`);
    const idsWithoutNils = removeNils(ids);
    if (R.isEmpty(idsWithoutNils)) return Promise.resolve([]);

    const [externals, locals] = splitBy(idsWithoutNils, id => id.isLocal(this.name));

    const localDefs = await this.sources.getMany(locals);
    const componentVersionArr = await Promise.all(
      localDefs.map((def) => {
        if (!def.component) throw new ComponentNotFound(def.id.toString());
        return def.component.toComponentVersion(def.id.version);
      })
    );
    const remotes = await this.remotes();
    const externalDeps = await this.getExternalOnes(externals, remotes, cache);
    return componentVersionArr.concat(externalDeps);
  }

  manyOneObjects(ids: BitId[]): Promise<ComponentObjects[]> {
    return this.importManyOnes(ids).then(componentVersions =>
      Promise.all(
        componentVersions.map((version) => {
          return version.toObjects(this.objects);
        })
      )
    );
  }

  import(id: BitId): Promise<VersionDependencies> {
    if (!id.isLocal(this.name)) {
      return this.remotes().then(remotes => this.getExternal({ id, remotes, localFetch: true }));
    }

    return this.sources.get(id).then((component) => {
      if (!component) throw new ComponentNotFound(id.toString());
      return component.toVersionDependencies(id.version, this, this.name);
    });
  }

  async get(id: BitId): Promise<ComponentWithDependencies> {
    return this.import(id).then((versionDependencies) => {
      return versionDependencies.toConsumer(this.objects);
    });
  }

  /**
   * return a component only when it's stored locally. Don't go to any remote server and don't throw an exception if the
   * component is not there.
   */
  async getFromLocalIfExist(id: BitId): Promise<?ComponentWithDependencies> {
    const componentFromSources = await this.sources.get(id);
    if (!componentFromSources) return null;
    const versionDependencies = await componentFromSources.toVersionDependencies(id.version, this, this.name);
    return versionDependencies.toConsumer(this.objects);
  }

  /**
   * get multiple components from a scope, if not found in the local scope, fetch from a remote
   * scope. Then, write them to the local scope.
   */
  getMany(ids: BitId[], cache?: boolean = true): Promise<ComponentWithDependencies[]> {
    logger.debug(`scope.getMany, Ids: ${ids.join(', ')}`);
    const idsWithoutNils = removeNils(ids);
    if (R.isEmpty(idsWithoutNils)) return Promise.resolve([]);
    return this.importMany(idsWithoutNils, false, cache).then((versionDependenciesArr: VersionDependencies[]) => {
      return Promise.all(
        versionDependenciesArr.map(versionDependencies => versionDependencies.toConsumer(this.objects))
      );
    });
  }

  // todo: improve performance by finding all versions needed and fetching them in one request from the server
  // currently it goes to the server twice. First, it asks for the last version of each id, and then it goes again to
  // ask for the older versions.
  async getManyWithAllVersions(ids: BitId[], cache?: boolean = true): Promise<ComponentWithDependencies[]> {
    logger.debug(`scope.getManyWithAllVersions, Ids: ${ids.join(', ')}`);
    const idsWithoutNils = removeNils(ids);
    if (R.isEmpty(idsWithoutNils)) return Promise.resolve([]);
    const versionDependenciesArr: VersionDependencies[] = await this.importMany(idsWithoutNils, false, cache);

    const allVersionsP = versionDependenciesArr.map((versionDependencies) => {
      const versions = versionDependencies.component.component.listVersions();
      const idsWithAllVersions = versions.map((version) => {
        if (version === versionDependencies.component.version) return null; // imported already
        const versionId = versionDependencies.component.id;
        versionId.version = version;
        return versionId;
      });
      return this.importManyOnes(idsWithAllVersions);
    });
    await Promise.all(allVersionsP);

    return Promise.all(versionDependenciesArr.map(versionDependencies => versionDependencies.toConsumer(this.objects)));
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
  async removeMany(bitIds: BitIds, force: boolean, removeSameOrigin: boolean = false): Promise<RemovedObjects> {
    logger.debug(`scope.removeMany ${bitIds} with force flag: ${force.toString()}`);
    const removeComponents = new RemoveModelComponents(this, bitIds, force, removeSameOrigin);
    return removeComponents.remove();
  }

  /**
   * findDependentBits
   * foreach component in array find the componnet that uses that component
   */
  async findDependentBits(bitIds: Array<BitId>, returnResultsWithVersion: boolean = false): Promise<Object> {
    const allComponents = await this.objects.listComponents(false);
    const allComponentVersions = await Promise.all(
      allComponents.map(async (component) => {
        const loadedVersions = await Promise.all(
          Object.keys(component.versions).map(async (version) => {
            const componentVersion = await component.loadVersion(version, this.objects);
            if (!componentVersion) return;
            componentVersion.id = BitId.parse(component.id());
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
        scopeComponents.flattenedDependencies.forEach((flattenedDependence) => {
          if (flattenedDependence.toStringWithoutVersion() === bitId.toStringWithoutVersion()) {
            returnResultsWithVersion
              ? dependencies.push(scopeComponents.id.toString())
              : dependencies.push(scopeComponents.id.toStringWithoutVersion());
          }
        });
      });

      if (!R.isEmpty(dependencies)) dependentBits[bitId.toStringWithoutVersion()] = R.uniq(dependencies);
    });
    return Promise.resolve(dependentBits);
  }

  /**
   * split bit array to found and missing components (incase user misspelled id)
   */
  async filterFoundAndMissingComponents(
    bitIds: Array<BitId>
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
  async deprecateMany(bitIds: Array<BitId>): Promise<any> {
    const { missingComponents, foundComponents } = await this.filterFoundAndMissingComponents(bitIds);
    const deprecateComponents = () => foundComponents.map(async bitId => this.deprecateSingle(bitId));
    const deprecatedComponents = await Promise.all(deprecateComponents());
    const missingComponentsStrings = missingComponents.map(id => id.toStringWithoutVersion());
    return { bitIds: deprecatedComponents, missingComponents: missingComponentsStrings };
  }

  reset({ bitId, consumer }: { bitId: BitId, consumer?: Consumer }): Promise<consumerComponent> {
    if (!bitId.isLocal(this.name)) {
      return Promise.reject('you can not reset a remote component');
    }
    return this.sources.get(bitId).then((component) => {
      if (!component) throw new ComponentNotFound(bitId.toString());
      const allVersions = component.listVersions();
      if (allVersions.length > 1) {
        const lastVersion = component.latest();
        bitId.version = lastVersion.toString();
        return consumer.removeFromComponents(bitId, true).then(() => {
          // TODO: this won't work any more because the version is now string (semver)
          bitId.version = (lastVersion - 1).toString();
          return this.get(bitId).then((consumerComponent) => {
            const ref = component.versions[lastVersion];
            return this.objects
              .remove(ref)
              .then(() => {
                // todo: remove also all deps of that ref
                delete component.versions[lastVersion];
                this.objects.add(component);
                return this.objects.persist();
              })
              .then(() => consumerComponent);
          });
        });
      }
      return this.get(bitId).then(consumerComponent =>
        consumer.removeFromComponents(bitId).then(() => this.clean(bitId).then(() => consumerComponent))
      );
    });
  }

  loadRemoteComponent(id: BitId): Promise<ConsumerComponent> {
    return this.getComponentVersion(id).then((component) => {
      if (!component) throw new ComponentNotFound(id.toString());
      return component.toConsumer(this.objects);
    });
  }

  loadComponent(id: BitId, localOnly: boolean = true): Promise<ConsumerComponent> {
    logger.debug(`scope.loadComponent, id: ${id}`);
    if (localOnly && !id.isLocal(this.name)) {
      throw new Error('cannot load bit from remote scope, please import first');
    }
    return this.loadRemoteComponent(id);
  }

  /**
   * load components from the model and return them as ComponentVersion array.
   * if a component is not available locally, it'll just ignore it without throwing any error.
   */
  async loadLocalComponents(ids: BitId[]): Promise<ComponentVersion[]> {
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

  loadAllVersions(id: BitId): Promise<ConsumerComponent> {
    return this.sources.get(id).then((componentModel) => {
      if (!componentModel) throw new ComponentNotFound(id.toString());
      return componentModel.collectVersions(this.objects);
    });
  }

  async getComponentVersion(id: BitId): Promise<ComponentVersion> {
    if (!id.isLocal(this.name)) {
      return this.remotes().then(remotes => this.getExternalOne({ id, remotes, localFetch: true }));
    }

    return this.sources.get(id).then((component) => {
      if (!component) throw new ComponentNotFound(id.toString());
      return component.toComponentVersion(id.version);
    });
  }

  /**
   * Get ComponentModel instance per bit-id. The id can be either with or without a scope-name.
   * In case the component is saved in the model only with the scope (imported), it loads all
   * components and search for it.
   * It throws an error if the component wasn't found.
   */
  async getComponentModel(id: BitId): Promise<ComponentModel> {
    const component = await this.sources.get(id);
    if (component) return component;
    if (!id.scope) {
      // search for the complete ID
      const components: ComponentModel[] = await this.objects.listComponents(false); // don't fetch Symlinks
      const foundComponent = components.filter(
        c => c.toBitId().toStringWithoutScopeAndVersion() === id.toStringWithoutVersion()
      );
      // $FlowFixMe
      if (foundComponent.length) return first(foundComponent);
    }
    throw new ComponentNotFound(id.toString());
  }

  /**
   * Creates a symlink object with the local-scope which links to the real-object of the remote-scope
   * This way, local components that have dependencies to the exported component won't break.
   */
  createSymlink(id, remote) {
    const symlink = new Symlink({
      scope: id.scope,
      name: id.name,
      box: id.box,
      realScope: remote
    });
    return this.objects.add(symlink);
  }

  async exportMany(ids: string[], remoteName: string, context: Object = {}, eject: boolean): Promise<BitId[]> {
    logger.debug(`exportMany, ids: ${ids.join(', ')}`);
    const remotes = await this.remotes();
    if (eject && !remotes.isHub(remoteName)) {
      return Promise.reject('--eject flag is relevant only when the remote is a hub');
    }
    const remote = await remotes.resolve(remoteName, this);
    const componentIds = ids.map(id => BitId.parse(id));
    const componentObjectsP = componentIds.map(id => this.sources.getObjects(id));
    const componentObjects = await Promise.all(componentObjectsP);
    const componentsAndObjects = [];
    enrichContextFromGlobal(context);
    const manyObjectsP = componentObjects.map(async (componentObject: ComponentObjects) => {
      const componentAndObject = componentObject.toObjects(this.objects);
      componentAndObject.component.clearStateData();
      this._convertNonScopeToCorrectScope(componentAndObject, remoteName);
      componentsAndObjects.push(componentAndObject);
      const componentBuffer = await componentAndObject.component.compress();
      const objectsBuffer = await Promise.all(componentAndObject.objects.map(obj => obj.compress()));
      return new ComponentObjects(componentBuffer, objectsBuffer);
    });
    const manyObjects = await Promise.all(manyObjectsP);
    let exportedIds;
    try {
      exportedIds = await remote.pushMany(manyObjects, context);
      logger.debug('exportMany: successfully pushed all ids to the bare-scope, going to save them back to local scope');
    } catch (err) {
      logger.warn('exportMany: failed pushing ids to the bare-scope');
      return Promise.reject(err);
    }
    await Promise.all(componentIds.map(id => this.clean(id)));
    componentIds.map(id => this.createSymlink(id, remoteName));
    const idsWithRemoteScope = exportedIds.map(id => BitId.parse(id));
    await Promise.all(componentsAndObjects.map(componentObject => this.sources.merge(componentObject)));
    await this.objects.persist();
    return idsWithRemoteScope;
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
   * sync method that loads the environment/(path to environment component)
   */
  loadEnvironment(bitId: BitId, opts: ?{ pathOnly?: ?boolean, bareScope?: ?boolean }) {
    logger.debug(`scope.loadEnvironment, id: ${bitId}`);
    if (!bitId) throw new ResolutionException();
    const notFound = () => {
      logger.debug(`Unable to find an env component ${bitId.toString()}`);
      return false;
    };

    let envPath;
    try {
      envPath = componentResolver(bitId.toString(), null, this.getPath());
    } catch (err) {
      return notFound();
    }
    if (!IsolatedEnvironment.isEnvironmentInstalled(envPath)) return notFound();

    if (opts && opts.pathOnly) {
      return envPath;
    }

    try {
      logger.debug(`Requiring an environment file at ${envPath}`);
      return require(envPath);
    } catch (e) {
      throw new ResolutionException(e);
    }
  }

  // TODO: Change name since it also used to install extension
  async installEnvironment({
    ids,
    verbose,
    dontPrintEnvMsg
  }: {
    ids: [{ componentId: BitId, type: string }],
    verbose?: boolean,
    dontPrintEnvMsg?: boolean
  }): Promise<any> {
    logger.debug(`scope.installEnvironment, ids: ${ids.join(', ')}`);
    const componentsDir = this.getComponentsPath();
    const isolateOpts = {
      writeBitDependencies: false,
      installPackages: true,
      noPackageJson: false,
      dist: true,
      conf: true,
      override: false,
      verbose,
      silentPackageManagerResult: true
    };
    const idsWithoutNils = removeNils(ids);
    const predicate = id => id.componentId.toString(); // TODO: should be moved to BitId class
    const uniqIds = R.uniqBy(predicate)(idsWithoutNils);
    const nonExistingEnvsIds = uniqIds.filter((id) => {
      return !this.loadEnvironment(id.componentId, { pathOnly: true });
    });

    const importEnv = async (id) => {
      let concreteId = id.componentId;
      if (id.componentId.getVersion().latest) {
        const concreteIds = await this.fetchRemoteVersions([id.componentId]);
        concreteId = concreteIds[0];
      }
      const dir = pathLib.join(componentsDir, Scope.getComponentRelativePath(concreteId));
      const env = new IsolatedEnvironment(this, dir);
      await env.create();
      const isolatedComponent = await env.isolateComponent(id.componentId, isolateOpts);
      if (!dontPrintEnvMsg) console.log(chalk.bold.green(`successfully installed the ${id.componentId} ${id.type}`));
      return isolatedComponent;
    };
    return pMapSeries(nonExistingEnvsIds, importEnv);
  }

  async bumpDependenciesVersions(componentsToUpdate: BitId[], committedComponents: BitId[], persist: boolean) {
    const componentsObjects = await this.sources.getMany(componentsToUpdate);
    const componentsToUpdateP = componentsObjects.map(async (componentObjects) => {
      const component = componentObjects.component;
      if (!component) return null;
      const latestVersion: Version = await component.loadVersion(component.latest(), this.objects);
      let pendingUpdate = false;
      latestVersion.getAllDependencies().forEach((dependency) => {
        const committedComponentId = committedComponents.find(
          committedComponent => committedComponent.toStringWithoutVersion() === dependency.id.toStringWithoutVersion()
        );

        if (!committedComponentId) return;
        if (persist && semver.gt(committedComponentId.version, dependency.id.version)) {
          pendingUpdate = true;
          dependency.id.version = committedComponentId.version;
          const flattenDependencyToUpdate = latestVersion.flattenedDependencies.find(
            flattenDependency => flattenDependency.toStringWithoutVersion() === dependency.id.toStringWithoutVersion()
          );
          flattenDependencyToUpdate.version = committedComponentId.version;
        } else if (!persist && semver.gte(committedComponentId.version, dependency.id.version)) {
          // if !persist, we only check whether a modified component may cause auto-tagging
          // since it's only modified on the file-system, its version might be the same as the version stored in its
          // dependents. That's why "semver.gte" is used instead of "server.gt".
          pendingUpdate = true;
        }
      });
      if (pendingUpdate) {
        if (!persist) return componentObjects.component;
        const message = 'bump dependencies versions';
        return this.sources.putAdditionalVersion(componentObjects.component, latestVersion, message);
      }
      return null;
    });
    const updatedComponentsAll = await Promise.all(componentsToUpdateP);
    const updatedComponents = removeNils(updatedComponentsAll);
    if (!R.isEmpty(updatedComponents) && persist) {
      await this.objects.persist();
    }
    return updatedComponents;
  }

  /**
   * find the components in componentsPool which one of their dependencies include in potentialDependencies
   */
  async findDirectDependentComponents(componentsPool: BitId[], potentialDependencies: BitId[]): Promise<Component[]> {
    const componentsVersions = await this.loadLocalComponents(componentsPool);
    const potentialDependenciesWithoutVersions = potentialDependencies.map(id => id.toStringWithoutVersion());
    const dependentsP = componentsVersions.map(async (componentVersion: ComponentVersion) => {
      const component: Version = await componentVersion.getVersion(this.objects);
      const found = component
        .getAllDependencies()
        .find(dependency => potentialDependenciesWithoutVersions.includes(dependency.id.toStringWithoutVersion()));
      return found ? componentVersion.toConsumer(this.objects) : null;
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
    keep,
    isCI = false
  }: {
    bitId: BitId,
    consumer?: ?Consumer,
    save?: ?boolean,
    verbose?: ?boolean,
    isolated?: boolean,
    directory?: string,
    keep?: boolean,
    isCI?: boolean
  }): Promise<?any> {
    if (!bitId.isLocal(this.name)) {
      throw new Error('cannot run specs on remote component');
    }

    const component = await this.loadComponent(bitId);
    return component.runSpecs({
      scope: this,
      consumer,
      save,
      verbose,
      isolated,
      directory,
      keep,
      isCI
    });
  }

  async build({
    bitId,
    save,
    consumer,
    verbose,
    directory,
    keep,
    isCI
  }: {
    bitId: BitId,
    save?: ?boolean,
    consumer?: Consumer,
    verbose?: ?boolean,
    directory: ?string,
    keep: ?boolean,
    isCI: ?boolean
  }): Promise<string> {
    if (!bitId.isLocal(this.name)) {
      throw new Error('cannot run build on remote component');
    }
    const component: Component = await this.loadComponent(bitId);
    return component.build({ scope: this, save, consumer, verbose, directory, keep, isCI });
  }

  /**
   * import a component end to end. Including importing the dependencies and installing the npm
   * packages.
   *
   * @param {string} bitId - the component id to isolate
   * @param {IsolateOptions} opts
   * @return {Promise.<string>} - the path to the isolated component
   */
  async isolateComponent(bitId: string, opts: IsolateOptions): Promise<string> {
    const parsedId = BitId.parse(bitId);
    const component = await this.loadComponent(parsedId);
    return component.isolate(this, opts);
  }

  static ensure(path: string = process.cwd(), name: ?string, groupName: ?string) {
    if (pathHasScope(path)) return this.load(path);
    if (!name) name = currentDirName();
    const scopeJson = new ScopeJson({ name, groupName, version: BIT_VERSION });
    return Promise.resolve(new Scope({ path, created: true, scopeJson }));
  }

  static load(absPath: string): Promise<Scope> {
    let scopePath = propogateUntil(absPath);
    if (!scopePath) throw new ScopeNotFound();
    if (fs.existsSync(pathLib.join(scopePath, BIT_HIDDEN_DIR))) {
      scopePath = pathLib.join(scopePath, BIT_HIDDEN_DIR);
    }
    const path = scopePath;

    return readFile(getScopeJsonPath(scopePath)).then((rawScopeJson) => {
      const scopeJson = ScopeJson.loadFromJson(rawScopeJson.toString());
      return new Scope({ path, scopeJson });
    });
  }
}
