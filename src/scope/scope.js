/** @flow */
import * as pathLib from 'path';
import fs from 'fs-extra';
import path from 'path';
import R, { merge, splitWhen } from 'ramda';
import Toposort from 'toposort-class';
import { GlobalRemotes } from '../global-config';
import { flattenDependencyIds, flattenDependencies } from './flatten-dependencies';
import ComponentObjects from './component-objects';
import ComponentModel from './models/component';
import { Symlink, Version } from './models';
import { Remotes } from '../remotes';
import types from './object-registrar';
import { propogateUntil, currentDirName, pathHas, first, readFile, splitBy } from '../utils';
import { BIT_HIDDEN_DIR, LATEST, OBJECTS_DIR, BITS_DIRNAME, BIT_JSON, DEFAULT_DIST_DIRNAME } from '../constants';
import { ScopeJson, getPath as getScopeJsonPath } from './scope-json';
import { ScopeNotFound, ComponentNotFound, ResolutionException, DependencyNotFound } from './exceptions';
import { RemoteScopeNotFound } from './network/exceptions';
import { Tmp } from './repositories';
import { BitId, BitIds } from '../bit-id';
import ConsumerComponent from '../consumer/component';
import ComponentVersion from './component-version';
import { Repository, Ref, BitObject } from './objects';
import ComponentWithDependencies from './component-dependencies';
import VersionDependencies from './version-dependencies';
import SourcesRepository from './repositories/sources';
import { postExportHook, postImportHook } from '../hooks';
import npmClient from '../npm-client';
import Consumer from '../consumer/consumer';
import { index } from '../search/indexer';
import loader from '../cli/loader';
import {
  BEFORE_PERSISTING_PUT_ON_SCOPE,
  BEFORE_IMPORT_PUT_ON_SCOPE,
  BEFORE_INSTALL_NPM_DEPENDENCIES } from '../cli/loader/loader-messages';
import performCIOps from './ci-ops';
import logger from '../logger/logger';
import componentResolver from '../component-resolver';

const removeNils = R.reject(R.isNil);
const pathHasScope = pathHas([OBJECTS_DIR, BIT_HIDDEN_DIR]);

export type ScopeDescriptor = {
  name: string
};

export type ScopeProps = {
  path: string,
  scopeJson: ScopeJson;
  created?: boolean;
  tmp?: Tmp;
  sources?: SourcesRepository;
  objects?: Repository;
};

export default class Scope {
  created: boolean = false;
  scopeJson: ScopeJson;
  tmp: Tmp;
  path: string;
  // sources: SourcesRepository; // for some reason it interferes with the IDE autocomplete
  objects: Repository;

  constructor(scopeProps: ScopeProps) {
    this.path = scopeProps.path;
    this.scopeJson = scopeProps.scopeJson;
    this.created = scopeProps.created || false;
    this.tmp = scopeProps.tmp || new Tmp(this);
    this.sources = scopeProps.sources || new SourcesRepository(this);
    this.objects = scopeProps.objects || new Repository(this, types());
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
    return pathLib.join(this.path, BITS_DIRNAME);
  }

  getBitPathInComponentsDir(id: BitId): string {
    return pathLib.join(this.getComponentsPath(), id.toFullPath());
  }

  remotes(): Promise<Remotes> {
    const self = this;
    function mergeRemotes(globalRemotes: GlobalRemotes) {
      const globalObj = globalRemotes.toPlainObject();
      return Remotes.load(merge(globalObj, self.scopeJson.remotes));
    }

    return GlobalRemotes.load()
      .then(mergeRemotes);
  }

  describe(): ScopeDescriptor {
    return {
      name: this.name
    };
  }

  toConsumerComponents(components: ComponentModel[]): Promise<ConsumerComponent[]> {
    return Promise.all(components
    .filter(comp => !(comp instanceof Symlink))
    .map(c =>
      c.toConsumerComponent(c.latest().toString(), this.name, this.objects))
    );
  }

  list() { // @Deprecated
    return this.objects.listComponents() // @TODO - check version and cross check them with components
      .then(components => this.toConsumerComponents(components));
  }

  async listStage() {
    const components = await this.objects.listComponents(false);
    return this.toConsumerComponents(components.filter(c => !c.scope || c.scope === this.name));
  }

  importDependencies(dependencies: BitId[]) {
    return new Promise((resolve, reject) => {
      return this.importMany(dependencies)
        .then(resolve)
        .catch((e) => {
          if (e instanceof RemoteScopeNotFound) return reject(e);
          reject(new DependencyNotFound(e.id));
        });
    });
  }

  async putMany({ consumerComponents, message, force, consumer, verbose }: {
    consumerComponents: ConsumerComponent[],
    message: string,
    force: ?bool,
    consumer: Consumer,
    verbose: ?bool,
  }):
  Promise<ComponentWithDependencies> { // TODO: Change the return type
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
      const dependenciesIdsStrings = consumerComponent.dependencies.map(dependency => dependency.id.toString());
      topSort.add(componentIdString, dependenciesIdsStrings || []);
    });

    // Sort the consumerComponents by the dependency order so we can commit those without the dependencies first
    const sortedConsumerComponentsIds = topSort.sort().reverse();

    const getFlattenForComponent = (consumerComponent, cache) => {
      const flattenedDependenciesP = consumerComponent.dependencies.map(async (dependency) => {
        // Try to get the flatten dependencies from cache
        let flattenedDependencies = cache.get(dependency.id.toString());
        if (flattenedDependencies) return Promise.resolve(flattenedDependencies);

        // Calculate the flatten dependencies
        const versionDependencies = await this.importDependencies([dependency.id]);
        // Copy the exact version from flattenedDependency to dependencies
        if (!dependency.id.hasVersion()) {
          dependency.id.version = first(versionDependencies).component.version;
        }

        flattenedDependencies = await flattenDependencyIds(versionDependencies, this.objects);

        // Store the flatten dependencies in cache
        cache.set(dependency.id.toString(), flattenedDependencies);

        return flattenedDependencies;
      });
      return Promise.all(flattenedDependenciesP);
    };

    const persistComponentsP = sortedConsumerComponentsIds.map(consumerComponentId => async () => {
      const consumerComponent = consumerComponentsIdsMap.get(consumerComponentId);
      // This happens when there is a dependency which have been already committed
      if (!consumerComponent) return Promise.resolve([]);
      let flattenedDependencies = await getFlattenForComponent(consumerComponent, allDependencies);
      flattenedDependencies = R.flatten(flattenedDependencies);
      const predicate = id => id.toString(); // TODO: should be moved to BitId class
      flattenedDependencies = R.uniqBy(predicate)(flattenedDependencies);
      const component = await this.sources.addSource({
        source: consumerComponent,
        depIds: flattenedDependencies,
        message,
        force,
        consumer,
        verbose });
      loader.start(BEFORE_PERSISTING_PUT_ON_SCOPE);
      await this.objects.persist();
      const deps = await component.toVersionDependencies(LATEST, this, this.name);
      consumerComponent.version = deps.component.version;
      await deps.toConsumer(this.objects);
      await index(consumerComponent, this.getPath()); // todo: make sure it still works
      return consumerComponent;
    });

    // Run the persistence one by one not in parallel!
    return persistComponentsP.reduce((promise, func) =>
      promise.then(result => func().then(Array.prototype.concat.bind(result))),
    Promise.resolve([]));
  }

  /**
   * Writes a component as an object into the 'objects' directory
   */
  writeComponentToModel(componentObjects: ComponentObjects): Promise<any> {
    const objects = componentObjects.toObjects(this.objects);
    logger.debug(`writeComponentToModel, writing into the model, Main id: ${objects.component.id()}. It might have dependencies which are going to be written too`);
    return this.sources.merge(objects)
      .then(() => this.objects.persist());
  }

  /**
   * When exporting components with dependencies to a bare-scope, some of the dependencies may be created locally and as
   * as result their scope-name is null. Once the bare-scope gets the components, it needs to convert these scope names
   * to the bare-scope name.
   * Since the changes it does affect the Version objects, the version REF of a component, needs to be changed as well.
   */
  _convertNonScopeToCorrectScope(componentsObjects: ComponentObjects, remoteScope: string): void {

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

    componentsObjects.objects.forEach((object: Ref) => {
      if (object instanceof Version) {
        const hashBefore = object.hash().toString();
        object.dependencies.forEach((dependency) => {
          changeScopeIfNeeded(dependency.id);
        });
        object.flattenedDependencies.forEach((dependency) => {
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
  }

  /**
   * @TODO there is no real difference between bare scope and a working directory scope - let's adjust terminology to avoid confusions in the future
   * saves a component into the objects directory of the remote scope, then, resolves its
   * dependencies, saves them as well. Finally runs the build process if needed on an isolated
   * environment.
   */
  async exportManyBareScope(componentsObjects: ComponentObjects[]): Promise<any> {
    logger.debug(`exportManyBareScope: Going to save ${componentsObjects.length} components`);
    const manyObjects = componentsObjects.map(componentObjects => componentObjects.toObjects(this.objects));
    await Promise.all(manyObjects.map(objects => this.sources.merge(objects, true)));
    const manyCompVersions = await Promise
      .all(manyObjects.map(objects => objects.component.toComponentVersion(LATEST)));
    logger.debug('exportManyBareScope: will try to importMany in case there are missing dependencies');
    const versions = await this.importMany(manyCompVersions.map(compVersion => compVersion.id)); // resolve dependencies
    logger.debug('exportManyBareScope: successfully ran importMany');
    await this.objects.persist();
    const objs = await Promise.all(versions.map(version => version.toObjects(this.objects)));
    const manyConsumerComponent = await Promise
      .all(manyCompVersions.map(compVersion => compVersion.toConsumer(this.objects)));
    await Promise.all(manyConsumerComponent.map(consumerComponent => index(consumerComponent, this.getPath())));
    await postExportHook({ ids: manyConsumerComponent.map(consumerComponent => consumerComponent.id.toString()) });
    await Promise.all(manyConsumerComponent.map(consumerComponent => performCIOps(consumerComponent, this.getPath())));
    return objs;
  }


  getExternalOnes(ids: BitId[], remotes: Remotes, localFetch: bool = false) {
    logger.debug(`getExternalOnes, ids: ${ids.join(', ')}`);
    return this.sources.getMany(ids)
      .then((defs) => {
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
          .fetch(left.map(def => def.id), this, true)
          .then((componentObjects) => {
            return Promise.all(componentObjects.map(compObj => this.writeComponentToModel(compObj)));
          })
          .then(() => this.getExternalOnes(ids, remotes, true));
      });
  }

  /**
   * If found locally, use them. Otherwise, fetch from remote and then, save into the model.
   */
  getExternalMany(ids: BitId[], remotes: Remotes, localFetch: bool = true):
  Promise<VersionDependencies[]> {
    logger.debug(`getExternalMany, planning on fetching from ${localFetch ? 'local': 'remote'} scope. Ids: ${ids.join(', ')}`);
    return this.sources.getMany(ids)
      .then((defs) => {
        const left = defs.filter((def) => {
          if (!localFetch) return true;
          if (!def.component) return true;
          return false;
        });

        if (left.length === 0) {
          logger.debug('getExternalMany: no more ids left, all found locally, existing the method');
          // $FlowFixMe - there should be a component because there no defs without components left.
          return Promise.all(defs.map(def => def.component.toVersionDependencies(
            def.id.version,
            this,
            def.id.scope
          )));
        }

        logger.debug(`getExternalMany: ${left.length} left. Fetching them from a remote`);
        return remotes
          .fetch(left.map(def => def.id), this)
          .then((componentObjects) => {
            logger.debug('getExternalMany: writing them to the model');
            return Promise.all(componentObjects.map(compObj => this.writeComponentToModel(compObj)));
          })
          .then(() => this.getExternalMany(ids, remotes));
      });
  }

  /**
   * If the component is not in the local scope, fetch it from a remote and save into the local
   * scope. (objects directory).
   */
  getExternal({ id, remotes, localFetch = true }: {
    id: BitId,
    remotes: Remotes,
    localFetch: bool,
  }): Promise<VersionDependencies> {
    return this.sources.get(id)
      .then((component) => {
        if (component && localFetch) {
          return component.toVersionDependencies(id.version, this, id.scope);
        }

        return remotes
          .fetch([id], this)
          .then(([componentObjects, ]) => {
            return this.writeComponentToModel(componentObjects);
          })
          .then(() => this.getExternal({ id, remotes, localFetch: true }));
      });
  }

  getExternalOne({ id, remotes, localFetch = true }: {
    id: BitId, remotes: Remotes, localFetch: bool }) {
    return this.sources.get(id)
      .then((component) => {
        if (component && localFetch) return component.toComponentVersion(id.version);
        return remotes.fetch([id], this, true)
          .then(([componentObjects, ]) => this.writeComponentToModel(componentObjects))
          .then(() => this.getExternal({ id, remotes, localFetch: true }));
      });
  }

  async getObjects(ids: BitId[], withDevDependencies?: bool): Promise<ComponentObjects[]> {
    const versions = await this.importMany(ids, withDevDependencies);
    return Promise.all(versions.map(version => version.toObjects(this.objects)));
  }

  getObject(hash: string): Promise<BitObject> {
    return new Ref(hash).load(this.objects);
  }

  /**
   * 1. Local objects, fetch from local. (done by this.sources.getMany method)
   * 2. Fetch flattened dependencies (done by toVersionDependencies method). If they're not locally, fetch from remote
   * and save them locally.
   * 3. External objects, fetch from a remote and save locally. (done by this.getExternalOnes method).
   */
  async importMany(ids: BitIds, withEnvironments?: boolean, cache: boolean = true):
  Promise<VersionDependencies[]> {
    logger.debug(`scope.importMany: ${ids.join(', ')}`);
    const idsWithoutNils = removeNils(ids);
    if (R.isEmpty(idsWithoutNils)) return Promise.resolve([]);

    const [externals, locals] = splitWhen(id => id.isLocal(this.name), idsWithoutNils);

    const localDefs = await this.sources.getMany(locals);
    const versionDeps = await Promise.all(localDefs.map((def) => {
      if (!def.component) throw new ComponentNotFound(def.id.toString());
      return def.component.toVersionDependencies(
        def.id.version,
        this,
        def.id.scope,
        withEnvironments,
      );
    }));
    logger.debug('scope.importMany: successfully fetched local components and their dependencies. Going to fetch externals');
    await postImportHook({ ids: R.flatten(versionDeps.map(vd => vd.getAllIds())) });
    const remotes = await this.remotes();
    const externalDeps = await this.getExternalMany(externals, remotes, cache);
    return versionDeps.concat(externalDeps);
  }

  importManyOnes(ids: BitId[], cache: boolean): Promise<ComponentVersion[]> {
    logger.debug(`scope.importManyOnes. Ids: ${ids.join(', ')}`);
    const idsWithoutNils = removeNils(ids);
    if (R.isEmpty(idsWithoutNils)) return Promise.resolve([]);

    const [externals, locals] = splitBy(idsWithoutNils, id => id.isLocal(this.name));

    return this.sources.getMany(locals)
      .then((localDefs) => {
        return Promise.all(localDefs.map((def) => {
          if (!def.component) throw new ComponentNotFound(def.id.toString());
          return def.component.toComponentVersion(def.id.version);
        }))
          .then((componentVersionArr) => {
            return postImportHook({ ids: componentVersionArr.map(cv => cv.id.toString()) })
              .then(() => this.remotes()
                .then(remotes => this.getExternalOnes(externals, remotes, cache))
                .then(externalDeps => componentVersionArr.concat(externalDeps))
              );
          });
      });
  }

  manyOneObjects(ids: BitId[]): Promise<ComponentObjects[]> {
    return this.importManyOnes(ids)
      .then(componentVersions => Promise.all(componentVersions.map((version) => {
        return version.toObjects(this.objects);
      })));
  }

  import(id: BitId): Promise<VersionDependencies> {
    if (!id.isLocal(this.name)) {
      return this.remotes()
        .then(remotes => this.getExternal({ id, remotes, localFetch: true }));
    }

    return this.sources.get(id)
      .then((component) => {
        if (!component) throw new ComponentNotFound(id.toString());
        return component.toVersionDependencies(id.version, this, this.name);
      });
  }

  async get(id: BitId): Promise<ConsumerComponent> {
    return this.import(id)
      .then((versionDependencies) => {
        return versionDependencies.toConsumer(this.objects);
      });
  }

  /**
   * get multiple components from a scope, if not found in the local scope, fetch from a remote
   * scope. Then, write them to the local scope.
   */
  getMany(ids: BitId[], cache?: bool = true): Promise<ComponentWithDependencies[]> {
    logger.debug(`scope.getMany, Ids: ${ids.join(', ')}`);
    const idsWithoutNils = removeNils(ids);
    if (R.isEmpty(idsWithoutNils)) return Promise.resolve([]);
    return this.importMany(idsWithoutNils, false, cache)
      .then((versionDependenciesArr: VersionDependencies[]) => {
        return Promise.all(
          versionDependenciesArr.map(versionDependencies =>
            versionDependencies.toConsumer(this.objects)
          )
        );
      });
  }

  // todo: improve performance by finding all versions needed and fetching them in one request from the server
  // currently it goes to the server twice. First, it asks for the last version of each id, and then it goes again to
  // ask for the older versions.
  async getManyWithAllVersions(ids: BitId[], cache?: bool = true): Promise<ConsumerComponent[]> {
    logger.debug(`scope.getManyWithAllVersions, Ids: ${ids.join(', ')}`);
    const idsWithoutNils = removeNils(ids);
    if (R.isEmpty(idsWithoutNils)) return Promise.resolve([]);
    const versionDependenciesArr: VersionDependencies[] = await this.importMany(idsWithoutNils, false, cache);

    const allVersionsP = versionDependenciesArr.map((versionDependencies) => {
      const versions = versionDependencies.component.component.listVersions();
      const idsWithAllVersions = versions.map((version) => {
        if (version === versionDependencies.component.version) return null; // imported already
        const versionId = versionDependencies.component.id;
        versionId.version = version.toString();
        return versionId;
      });
      return this.importManyOnes(idsWithAllVersions);
    });
    await Promise.all(allVersionsP);

    return Promise.all(
      versionDependenciesArr.map(versionDependencies =>
        versionDependencies.toConsumer(this.objects)
      )
    );
  }

  reset({ bitId, consumer }: { bitId: BitId, consumer?: Consumer}): Promise<consumerComponent> {
    if (!bitId.isLocal(this.name)) {
      return Promise.reject('you can not reset a remote component');
    }
    return this.sources.get(bitId)
      .then((component) => {
        if (!component) throw new ComponentNotFound(bitId.toString());
        const allVersions = component.listVersions();
        if (allVersions.length > 1) {
          const lastVersion = component.latest();
          bitId.version = lastVersion.toString();
          return consumer.removeFromComponents(bitId, true).then(() => {
            bitId.version = (lastVersion - 1).toString();
            return this.get(bitId).then((consumerComponent) => {
              const ref = component.versions[lastVersion];
              return this.objects.remove(ref).then(() => { // todo: remove also all deps of that ref
                delete component.versions[lastVersion];
                this.objects.add(component);
                return this.objects.persist();
              }).then(() => consumerComponent);
            });
          });
        }
        return this.get(bitId)
          .then(consumerComponent => consumer.removeFromComponents(bitId)
            .then(() => this.clean(bitId).then(() => consumerComponent)));
      });
  }

  loadRemoteComponent(id: BitId): Promise<ConsumerComponent> {
    return this.getOne(id)
      .then((component) => {
        if (!component) throw new ComponentNotFound(id.toString());
        return component.toConsumer(this.objects);
      });
  }

  loadComponent(id: BitId): Promise<ConsumerComponent> {
    logger.debug(`scope.loadComponent, id: ${id}`);
    if (!id.isLocal(this.name)) {
      throw new Error('cannot load bit from remote scope, please import first');
    }

    return this.loadRemoteComponent(id);
  }

  loadComponentLogs(id: BitId): Promise<{[number]: {message: string, date: string, hash: string}}> {
    return this.sources.get(id)
      .then((componentModel) => {
        if (!componentModel) throw new ComponentNotFound(id.toString());
        return componentModel.collectLogs(this.objects);
      });
  }

  loadAllVersions(id: BitId): Promise<ConsumerComponent> {
    return this.sources.get(id)
      .then((componentModel) => {
        if (!componentModel) throw new ComponentNotFound(id.toString());
        return componentModel.collectVersions(this.objects);
      });
  }

  async getOne(id: BitId): Promise<ComponentVersion> {
    if (!id.isLocal(this.name)) {
      return this.remotes()
        .then(remotes => this.getExternalOne({ id, remotes, localFetch: true }));
    }

    return this.sources.get(id)
      .then((component) => {
        if (!component) throw new ComponentNotFound(id.toString());
        return component.toComponentVersion(id.version);
      });
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

  async exportMany(ids: string[], remoteName: string): Promise<ComponentWithDependencies[]> {
    logger.debug(`exportMany, ids: ${ids.join(', ')}`);
    const remotes = await this.remotes();
    const remote = await remotes.resolve(remoteName, this);
    const componentIds = ids.map(id => BitId.parse(id));
    const components = componentIds.map(id => this.sources.getObjects(id));
    const componentObjects = await Promise.all(components);
    const manyObjectsP = componentObjects.map(async (componentObject) => {
      const componentAndObject = componentObject.toObjects(this.objects);
      this._convertNonScopeToCorrectScope(componentAndObject, remoteName);
      const componentBuffer = await componentAndObject.component.compress();
      const objectsBuffer = await Promise.all(componentAndObject.objects.map(obj => obj.compress()));
      return new ComponentObjects(componentBuffer, objectsBuffer);
    });
    const manyObjects = await Promise.all(manyObjectsP);
    const componentObjectsFromRemote = await remote.pushMany(manyObjects);
    logger.debug('exportMany: successfully pushed all ids to the bare-scope, going to save them back to local scope');
    await Promise.all(componentIds.map(id => this.clean(id)));
    componentIds.map(id => this.createSymlink(id, remoteName));
    await Promise.all(componentObjectsFromRemote.map((obj) => {
      const objects = obj.toObjects(this.objects);
      return this.sources.merge(objects);
    }));
    await this.objects.persist();
    const idsWithRemoteScope = componentIds.map(id => id.changeScope(remoteName));
    return this.getManyWithAllVersions(idsWithRemoteScope);
  }

  ensureDir() {
    fs.ensureDirSync(this.getComponentsPath());
    return this.tmp.ensureDir()
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
  async loadEnvironment(bitId: BitId, opts: ?{ pathOnly?: ?bool, bareScope?: ?bool }): Promise<> {
    logger.debug(`scope.loadEnvironment, id: ${bitId}`);
    if (!bitId) throw new ResolutionException();
    const envComponent = (await this.get(bitId)).component;
    const mainFile = (envComponent.dists && !R.isEmpty(envComponent.dists)) ? path.join(DEFAULT_DIST_DIRNAME, envComponent.mainFile)
                                                                           : envComponent.mainFile;

    if (opts && opts.pathOnly) {
      try {
        const envPath = componentResolver(bitId.toString(), mainFile, this.getPath());
        if (fs.existsSync(envPath)) return envPath;
        throw new Error(`Unable to find an env component ${bitId.toString()}`);
      } catch (e) {
        throw new ResolutionException(e.message);
      }
    }

    try {
      const envFile = componentResolver(bitId.toString(), mainFile, this.getPath());
      logger.debug(`Requiring an environment file at ${envFile}`);
      return require(envFile);
    } catch (e) {
      throw new ResolutionException(e);
    }
  }

  writeToComponentsDir(componentWithDependencies: ComponentWithDependencies[]): Promise<ConsumerComponent[]> {
    const componentsDir = this.getComponentsPath();
    const components: ConsumerComponent[] = flattenDependencies(componentWithDependencies);

    const bitDirForConsumerImport = (component: ConsumerComponent) => {
      return pathLib.join(
        componentsDir,
        component.box,
        component.name,
        component.scope,
        component.version.toString(),
      );
    };

    return Promise.all(components.map((component: ConsumerComponent) => {
      const bitPath = bitDirForConsumerImport(component);
      return component.write({ bitDir: bitPath });
    }));
  }

  installEnvironment({ ids, consumer, verbose }:
  { ids: BitId[], consumer?: Consumer, verbose?: boolean }): Promise<any> {
    logger.debug(`scope.installEnvironment, ids: ${ids.join(', ')}`);
    const installPackageDependencies = (component: ConsumerComponent) => {
      return npmClient.install(component.packageDependencies, {
        cwd: this.getBitPathInComponentsDir(component.id)
      }, verbose);
    };

    return this.getMany(ids)
      .then((componentDependenciesArr) => {
        const writeToProperDir = () => {
          return this.writeToComponentsDir(componentDependenciesArr);
        };

        return writeToProperDir()
          .then((components: ConsumerComponent[]) => {
            loader.start(BEFORE_INSTALL_NPM_DEPENDENCIES);
            return Promise.all(components.map(c => installPackageDependencies(c)))
            .then((resultsArr) => {
              if (verbose) {
                loader.stop(); // in order to show npm install output on verbose flag
                resultsArr.forEach(npmClient.printResults);
              }

              return components;
            });
          });
      });
  }

  async bumpDependenciesVersions(componentsToUpdate: BitId[], committedComponents: ConsumerComponent[]) {
    const componentsObjects = await this.sources.getMany(componentsToUpdate);
    const componentsToUpdateP = componentsObjects.map(async (componentObjects) => {
      const component = componentObjects.component;
      if (!component) return null;
      const latestVersion = await component.loadVersion(component.latest(), this.objects);
      let wasUpdated = false;
      latestVersion.dependencies.forEach((dependency) => {
        const committedComponentId = committedComponents.find(committedComponent => committedComponent
          .id.toStringWithoutVersion() === dependency.id.toStringWithoutVersion());
        if (committedComponentId && committedComponentId.version > dependency.id.version) {
          dependency.id.version = committedComponentId.version;
          const flattenDependencyToUpdate = latestVersion.flattenedDependencies
            .find(flattenDependency => flattenDependency
              .toStringWithoutVersion() === dependency.id.toStringWithoutVersion());
          flattenDependencyToUpdate.version = committedComponentId.version;
          wasUpdated = true;
        }
      });
      if (wasUpdated) {
        const message = 'bump dependencies versions';
        return this.sources.putAdditionalVersion(componentObjects.component, latestVersion, message);
      }
      return null;
    });
    const updatedComponentsAll = await Promise.all(componentsToUpdateP);
    const updatedComponents = removeNils(updatedComponentsAll);
    if (!R.isEmpty(updatedComponents)) {
      await this.objects.persist();
    }
    return updatedComponents;
  }

  async runComponentSpecs({ bitId, consumer, environment, save, verbose, isolated, directory, keep }: {
    bitId: BitId,
    consumer?: ?Consumer,
    environment?: ?bool,
    save?: ?bool,
    verbose?: ?bool,
    isolated?: bool,
    directory?: string,
    keep?: boolean
  }): Promise<?any> {
    if (!bitId.isLocal(this.name)) {
      throw new Error('cannot run specs on remote component');
    }

    const component = await this.loadComponent(bitId);
    return component.runSpecs({
      scope: this,
      consumer,
      environment,
      save,
      verbose,
      isolated,
      directory,
      keep
    });
  }

  async build({ bitId, environment, save, consumer, verbose, directory, keep, ciComponent }: {
    bitId: BitId,
    environment?: ?bool,
    save?: ?bool,
    consumer?: Consumer,
    verbose?: ?bool,
    directory: ?string,
    keep: ?boolean,
    ciComponent: any,
  }): Promise<string> {
    if (!bitId.isLocal(this.name)) {
      throw new Error('cannot run build on remote component');
    }
    const component = await this.loadComponent(bitId);
    return component.build({ scope: this, environment, save, consumer, verbose, directory, keep, ciComponent });
  }

  static ensure(path: string = process.cwd(), name: ?string, groupName: ?string) {
    if (pathHasScope(path)) return this.load(path);
    if (!name) name = currentDirName();
    const scopeJson = new ScopeJson({ name, groupName });
    return Promise.resolve(new Scope({ path, created: true, scopeJson }));
  }

  static load(absPath: string): Promise<Scope> {
    let scopePath = propogateUntil(absPath, pathHasScope);
    if (!scopePath) throw new ScopeNotFound();
    if (fs.existsSync(pathLib.join(scopePath, BIT_HIDDEN_DIR))) {
      scopePath = pathLib.join(scopePath, BIT_HIDDEN_DIR);
    }
    const path = scopePath;

    return readFile(getScopeJsonPath(scopePath))
      .then((rawScopeJson) => {
        const scopeJson = ScopeJson.loadFromJson(rawScopeJson.toString());
        const scope = new Scope({ path, scopeJson });
        return scope;
      });
  }
}
