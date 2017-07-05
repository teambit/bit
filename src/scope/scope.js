/** @flow */
import * as pathLib from 'path';
import fs from 'fs-extra';
import R, { merge, splitWhen } from 'ramda';
import { GlobalRemotes } from '../global-config';
import { flattenDependencyIds, flattenDependencies } from './flatten-dependencies';
import ComponentObjects from './component-objects';
import ComponentModel from './models/component';
import { Remotes } from '../remotes';
import types from './object-registrar';
import { propogateUntil, currentDirName, pathHas, first, readFile, splitBy } from '../utils';
import { BIT_HIDDEN_DIR, LATEST, OBJECTS_DIR, BITS_DIRNAME, BIT_JSON } from '../constants';
import { ScopeJson, getPath as getScopeJsonPath } from './scope-json';
import { ScopeNotFound, ComponentNotFound, ResolutionException, DependencyNotFound } from './exceptions';
import { RemoteScopeNotFound } from './network/exceptions';
import { Tmp } from './repositories';
import { BitId, BitIds } from '../bit-id';
import ConsumerComponent from '../consumer/component';
import ComponentVersion from './component-version';
import { Repository, Ref, BitObject } from './objects';
import ComponentDependencies from './component-dependencies';
import VersionDependencies from './version-dependencies';
import SourcesRepository from './repositories/sources';
import { postExportHook, postImportHook } from '../hooks';
import npmClient from '../npm-client';
import Consumer from '../consumer/consumer';
import { index } from '../search/indexer';
import loader from '../cli/loader';
import { Driver } from '../driver';
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
    return Promise.all(components.map(c =>
      c.toConsumerComponent(c.latest().toString(), this.name, this.objects))
    );
  }

  list() { // @Deprecated
    return this.objects.listComponents() // @TODO - check version and cross check them with components
      .then(components => this.toConsumerComponents(components));
  }

  listStage() {
    return this.objects.listComponents()
      .then(components => this.toConsumerComponents(
        components.filter(c => c.scope === this.name)
      ));
  }

  importDependencies(component: ConsumerComponent, bitDir?: string) {
    if (!bitDir) {
      // todo: when bitDir is empty, there will be no bit.json. Apply the auto-resolve-dependencies here.
      return Promise.resolve([]);
    }
    const bitJsonPath = pathLib.join(bitDir, BIT_JSON);
    return new Promise((resolve, reject) => {
      return this.importMany(component.dependencies)
        .then(resolve)
        .catch((e) => {
          if (e instanceof RemoteScopeNotFound) return reject(e);
          reject(new DependencyNotFound(e.id, bitJsonPath));
        });
    });
  }

  /**
   * Install drivers in the scope level
   */
  installDrivers(driversNames: string[]) {
    const path = this.getPath();
    return Promise.all(driversNames.map((driverName) => npmClient.install(driverName, { cwd: path })))
  }

  deleteNodeModulesDir():  Promise<*> {
    return new Promise((resolve, reject) => {
      const path = this.getPath() + '/node_modules';
      fs.remove(path, (err) => {
        if (err) return reject(err);
        return resolve();
      });
    });
  }

  // todo: get rid of bitDir
  put({ consumerComponent, message, force, consumer, bitDir, verbose }: {
    consumerComponent: ConsumerComponent,
    message: string,
    force: ?bool,
    consumer: Consumer,
    bitDir?: string,
    verbose: ?bool,
  }):
  Promise<ComponentDependencies> {
    consumerComponent.scope = this.name;
    loader.start(BEFORE_IMPORT_PUT_ON_SCOPE);

    return this.importDependencies(consumerComponent, bitDir)
      .then((dependencies) => {
        return flattenDependencyIds(dependencies, this.objects)
          .then((depIds) => {
            return this.sources.addSource({
              source: consumerComponent, depIds, message, force, consumer, verbose,
            })
              .then((component) => {
                loader.start(BEFORE_PERSISTING_PUT_ON_SCOPE);
                return this.objects.persist()
                  .then(() => component.toVersionDependencies(LATEST, this, this.name))
                  .then(deps => deps.toConsumer(this.objects))
                  .then(() => index(component, this.scope.getPath())); // todo: make sure it still works
              });
          });
      });
  }

  // todo: rename this method. It writes into the objects directory
  importSrc(componentObjects: ComponentObjects) {
    const objects = componentObjects.toObjects(this.objects);
    logger.debug(`importSrc, writing into the model, Main id: ${objects.component.id()}. It might have dependencies which are going to be written too`);
    return this.sources.merge(objects)
      .then(() => this.objects.persist());
  }

  // todo: rename this method, it takes place on the remote scope only
  /**
   * saves a component into the objects directory of the remote scope, then, resolves its
   * dependencies, saves them as well. Finally runs the build process if needed on an isolated
   * environment.
   */
  async export(componentObjects: ComponentObjects): Promise<any> {
    const objects = componentObjects.toObjects(this.objects);
    const { component } = objects;
    await this.sources.merge(objects, true);
    const compVersion = await component.toComponentVersion(LATEST, this.name);
    const versions = await this.importMany([compVersion.id], true); // resolve dependencies
    await this.objects.persist();
    const objs = await Promise.all(versions.map(version => version.toObjects(this.objects)));
    const consumerComponent = await compVersion.toConsumer(this.objects);
    await index(consumerComponent, this.getPath());
    await postExportHook({ id: consumerComponent.id.toString() });
    await performCIOps(consumerComponent, this.getPath());
    return first(objs);
  }

  getExternalOnes(ids: BitId[], remotes: Remotes, localFetch: bool = false) {
    return this.sources.getMany(ids)
      .then((defs) => {
        const left = defs.filter((def) => {
          if (!localFetch) return true;
          if (!def.component) return true;
          return false;
        });

        if (left.length === 0) {
          return Promise.all(defs.map((def) => {
            return def.component.toComponentVersion(
              def.id.version,
              this.name
            );
          }));
        }

        return remotes
          .fetch(left.map(def => def.id), this, true)
          .then((componentObjects) => {
            return Promise.all(componentObjects.map(compObj => this.importSrc(compObj)));
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
            return Promise.all(componentObjects.map(compObj => this.importSrc(compObj)));
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
            return this.importSrc(componentObjects);
          })
          .then(() => this.getExternal({ id, remotes, localFetch: true }));
      });
  }

  getExternalOne({ id, remotes, localFetch = true }: {
    id: BitId, remotes: Remotes, localFetch: bool }) {
    return this.sources.get(id)
      .then((component) => {
        if (component && localFetch) return component.toComponentVersion(id.version, this.name);
        return remotes.fetch([id], this, true)
          .then(([componentObjects, ]) => this.importSrc(componentObjects))
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
   * If not found in the local scope, fetch from a remote scope and save into the local scope
   */
  importMany(ids: BitIds, withDevDependencies?: bool, cache: boolean = true):
  Promise<VersionDependencies[]> {
    logger.debug(`scope.importMany: ${ids.join(', ')}`);
    const idsWithoutNils = removeNils(ids);
    if (R.isEmpty(idsWithoutNils)) return Promise.resolve([]);

    const [externals, locals] = splitWhen(id => id.isLocal(this.name), idsWithoutNils);

    return this.sources.getMany(locals)
      .then((localDefs) => {
        return Promise.all(localDefs.map((def) => {
          if (!def.component) throw new ComponentNotFound(def.id.toString());
          return def.component.toVersionDependencies(
            def.id.version,
            this,
            def.id.scope,
            withDevDependencies,
          );
        }))
          .then((versionDeps) => {
            return postImportHook({ ids: R.flatten(versionDeps.map(vd => vd.getAllIds())) })
              .then(() => this.remotes()
                .then(remotes => this.getExternalMany(externals, remotes, cache))
                .then(externalDeps => versionDeps.concat(externalDeps))
              );
          });
      });
  }

  importManyOnes(ids: BitId[], cache: boolean): Promise<ComponentVersion[]> {
    const idsWithoutNils = removeNils(ids);
    if (R.isEmpty(idsWithoutNils)) return Promise.resolve([]);

    const [externals, locals] = splitBy(idsWithoutNils, id => id.isLocal(this.name));

    return this.sources.getMany(locals)
      .then((localDefs) => {
        return Promise.all(localDefs.map((def) => {
          if (!def.component) throw new ComponentNotFound(def.id.toString());
          return def.component.toComponentVersion(def.id.version, this.name);
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

  get(id: BitId): Promise<ConsumerComponent> {
    return this.import(id)
      .then((versionDependencies) => {
        return versionDependencies.toConsumer(this.objects);
      });
  }

  /**
   * get multiple components from a scope, if not found in the local scope, fetch from a remote
   * scope. Then, write them to the local scope.
   */
  getMany(ids: BitId[], cache?: bool = true): Promise<ConsumerComponent[]> {
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

  // @TODO optimize ASAP
  modify({ bitId, consumer, no_env, verbose }: {
    bitId: BitId,
    consumer?: Consumer,
    no_env?: bool,
    verbose?: bool
  }): Promise<ComponentDependencies> {
    const installEnvironmentsIfNeeded = (component) => {
      if (no_env) return Promise.resolve();
      const ids = [component.compilerId, component.testerId];
      return this.installEnvironment({ ids, consumer, verbose });
    };

    return this.import(bitId)
      .then((versionDependencies) => {
        const versions = versionDependencies.component.component.listVersions();
        const versionsP = this.importManyOnes(versions.map((version) => {
          const versionId = BitId.parse(bitId.toString());
          versionId.version = version.toString();
          return versionId;
        }));

        return Promise.all([versionDependencies.toObjects(this.objects), versionsP]);
      })
      .then(([componentObjects, ]) => {
        return this.export(componentObjects);
      })
      .then(() => {
        bitId.scope = this.name;
        return this.get(bitId)
          .then((component) => {
            return installEnvironmentsIfNeeded(component.component)
              .then(() => component);
          });
      });
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

  getOne(id: BitId): Promise<ComponentVersion> {
    if (!id.isLocal(this.name)) {
      return this.remotes()
        .then(remotes => this.getExternalOne({ id, remotes, localFetch: true }));
    }

    return this.sources.get(id)
      .then((component) => {
        if (!component) throw new ComponentNotFound(id.toString());
        return component.toComponentVersion(id.version, this.name);
      });
  }

  exportAction(bitId: BitId, remoteName: string) {
    bitId.scope = this.name;
    return this.remotes().then((remotes) => {
      return remotes.resolve(remoteName, this)
        .then((remote) => {
          return this.sources.getObjects(bitId)
            .then(component => remote.push(component)
              .then(objects => this.clean(bitId).then(() => objects))
              .then(objects => this.importSrc(objects))
              .then(() => {
                bitId.scope = remoteName;
                return this.get(bitId);
              }));
        });
    });
  }

  ensureDir() {
    fs.ensureDirSync(this.getComponentsPath());
    return this.tmp.ensureDir()
      .then(() => this.scopeJson.write(this.getPath()))
      .then(() => this.objects.ensureDir())
      .then(() => this);
  }

  clean(bitId: BitId) {
    return this.sources.clean(bitId);
  }

  /**
   * sync method that loads the environment/(path to environment component)
   */
  loadEnvironment(bitId: BitId, opts: ?{ pathOnly?: ?bool, bareScope?: ?bool }) {
    // const envDir = opts && opts.bareScope ? this.getPath() : pathLib.dirname(this.getPath());
    if (opts && opts.pathOnly) {
      try {
        return componentResolver(bitId.toString(), this.getPath());
      } catch (e) {
        throw new ResolutionException(e.message);
      }
    }

    try {
      const envFile = componentResolver(bitId.toString(), this.getPath());
      logger.debug(`Requiring an environment file at ${envFile}`);
      return require(envFile);
    } catch (e) {
      throw new ResolutionException(e);
    }
  }

  writeToComponentsDir(componentDependencies: ComponentDependencies[]):
  Promise<ConsumerComponent[]> {
    const componentsDir = this.getComponentsPath();
    const components = flattenDependencies(componentDependencies);

    const bitDirForConsumerImport = (component: ConsumerComponent) => {
      return pathLib.join(
        componentsDir,
        component.box,
        component.name,
        component.scope,
        component.version.toString(),
      );
    };

    return Promise.all(components.map((component) => {
      const bitPath = bitDirForConsumerImport(component);
      return component.write(bitPath, true);
    }));
  }

  installEnvironment({ ids, consumer, verbose }:
  { ids: BitId[], consumer?: Consumer, verbose?: boolean }): Promise<any> {
    const installPackageDependencies = (component: ConsumerComponent) => {
      return npmClient.install(component.packageDependencies, {
        cwd: this.getBitPathInComponentsDir(component.id)
      });
    };

    return this.getMany(ids)
      .then((componentDependenciesArr) => {
        const writeToProperDir = () => {
          // todo: make sure we are ok with this decision of having the environment installed
          // in the same place for both, the local scope and the remote scope
          // if (consumer) { return consumer.writeToComponentsDir(componentDependenciesArr); }
          // also doing flatting for componentDependencies (need to refactor)
          return this.writeToComponentsDir(componentDependenciesArr);
          // also doing flatting for componentDependencies (need to refactor)
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

  runComponentSpecs({ bitId, consumer, environment, save, verbose, isolated }: {
    bitId: BitId,
    consumer?: ?Consumer,
    environment?: ?bool,
    save?: ?bool,
    verbose?: ?bool,
    isolated?: bool,
  }): Promise<?any> {
    if (!bitId.isLocal(this.name)) {
      throw new Error('cannot run specs on remote component');
    }

    return this.loadComponent(bitId)
      .then((component) => {
        const driver = Driver.load(component.lang);
        return this.installDrivers([driver.driverName()])
          .then(() => {
            return component.runSpecs({
              scope: this,
              consumer,
              environment,
              save,
              verbose,
              isolated,
            });
          })
          .then((specsResults) => {
            return this.deleteNodeModulesDir()
              .then(() => specsResults)
          });
      });
  }

  build({ bitId, environment, save, consumer, verbose }: {
    bitId: BitId,
    environment?: ?bool,
    save?: ?bool,
    consumer?: Consumer,
    verbose?: ?bool
  }): Promise<string> {
    if (!bitId.isLocal(this.name)) {
      throw new Error('cannot run build on remote component');
    }

    return this.loadComponent(bitId)
      .then((component) => {
        const driver = Driver.load(component.lang);
        return this.installDrivers([driver.driverName()])
          .then(() => {
            return component.build({ scope: this, environment, save, consumer, verbose });
          })
          .then(() => this.deleteNodeModulesDir());
      });
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
