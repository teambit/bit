/** @flow */
import * as pathLib from 'path';
import fs from 'fs-extra';
import R, { merge, splitWhen } from 'ramda';
import bitJs from 'bit-js';
import { GlobalRemotes } from '../global-config';
import { flattenDependencyIds, flattenDependencies } from './flatten-dependencies';
import ComponentObjects from './component-objects';
import ComponentModel from './models/component';
import { Remotes } from '../remotes';
import types from './object-registrar';
import { propogateUntil, currentDirName, pathHas, first, readFile, flatten } from '../utils';
import { BIT_HIDDEN_DIR, LATEST, OBJECTS_DIR, BITS_DIRNAME } from '../constants';
import { ScopeJson, getPath as getScopeJsonPath } from './scope-json';
import { ScopeNotFound, ComponentNotFound, ResolutionException } from './exceptions';
import { Tmp } from './repositories';
import { BitId, BitIds } from '../bit-id';
import ConsumerComponent from '../consumer/component';
import ComponentVersion from './component-version';
import { Repository, Ref, BitObject } from './objects';
import ComponentDependencies from './component-dependencies';
import VersionDependencies from './version-dependencies';
import SourcesRepository from './repositories/sources';
import { postExportHook, postImportHook } from '../hooks';
import type { Results } from '../specs-runner/specs-runner';
import npmInstall from '../utils/npm';
import Consumer from '../consumer/consumer';
import { index } from '../search/indexer';
import loader from '../cli/loader';
import {
  BEFORE_PERSISTING_PUT_ON_SCOPE,
  BEFORE_IMPORT_PUT_ON_SCOPE,
  BEFORE_INSTALL_NPM_DEPENDENCIES } from '../cli/loader/loader-messages';
import performCIOps from './ci-ops';

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
  sources: SourcesRepository;
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
    return this.objects.list() // @TODO - check version and cross check them with components
      .then(components => this.toConsumerComponents(components));
  }

  listStage() {
    return this.objects.list()
    .then(components => this.toConsumerComponents(
      components.filter(c => c.scope === this.name)
    ));
  }

  getDependencies() {
    
  }

  put({ consumerComponent, message, force, consumer }: 
  { 
    consumerComponent: ConsumerComponent,
    message: string,
    force: ?bool,
    consumer:Consumer
  }):
  Promise<ComponentDependencies> {
    consumerComponent.scope = this.name;
    loader.start(BEFORE_IMPORT_PUT_ON_SCOPE);

    return this.importMany(consumerComponent.dependencies).then((dependencies) => {
      return flattenDependencyIds(dependencies, this.objects)
        .then((depIds) => {
          return this.sources.addSource({
            source: consumerComponent, depIds, message, force, consumer
          })
          .then((component) => {
            loader.start(BEFORE_PERSISTING_PUT_ON_SCOPE);
            return this.objects.persist()
              .then(() => component.toVersionDependencies(LATEST, this, this.name))
              .then(deps => deps.toConsumer(this.objects));
          }); 
        });
    });
  }

  importSrc(componentObjects: ComponentObjects) {
    return this.sources.merge(componentObjects.toObjects(this.objects))
      .then(() => this.objects.persist());
  }

  export(componentObjects: ComponentObjects): Promise<any> {
    const objects = componentObjects.toObjects(this.objects);
    const { component } = objects;
    return this.sources.merge(objects, true)
      .then(() => this.objects.persist())
      .then(() => component.toComponentVersion(LATEST, this.name))
      .then((compVersion: ComponentVersion) => 
        this.getObjects([compVersion.id])
        .then((objs) => {
          return compVersion.toConsumer(this.objects)
          .then(consumerComponent => index(consumerComponent, this.getPath()))
          .then(consumerComponent => postExportHook({ id: consumerComponent.id.toString() }))
          .then(consumerComponent => performCIOps(consumerComponent, this.getPath()))
          .then(() => first(objs));
        })
      );
  }

  getExternalOnes(ids: BitId[], remotes: Remotes, localFetch: bool = false) {
    return this.sources.getMany(ids)
      .then((defs) => {
        if (localFetch) {
          return Promise.all(defs.map((def) => {
            return def.component.toComponentVersion(
            def.id.version, 
            this.name
          );
          }));
        }

        return remotes
          .fetch(defs.map(def => def.id), this, true)
          .then((componentObjects) => {
            return Promise.all(componentObjects.map(compObj => this.importSrc(compObj)));
          })
          .then(() => this.getExternalOnes(ids, remotes, true));
      });   
  }

  getExternalMany(ids: BitId[], remotes: Remotes, localFetch: bool = true):
  Promise<VersionDependencies[]> {
    return this.sources.getMany(ids)
      .then((defs) => {
        const left = defs.filter(def => !def.component && localFetch);
        if (left.length === 0) {
          return Promise.all(defs.map(def => def.component.toVersionDependencies(
            def.id.version, 
            this,
            def.id.scope
          )));
        }

        return remotes
          .fetch(left.map(def => def.id), this)
          .then((componentObjects) => {
            return Promise.all(componentObjects.map(compObj => this.importSrc(compObj)));
          })
          .then(() => this.getExternalMany(ids, remotes));
      });   
  }

  getExternal(id: BitId, remotes: Remotes, localFetch: bool = true): Promise<VersionDependencies> {
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
          .then(() => this.getExternal(id, remotes));
      });
  }

  getExternalOne(id: BitId, remotes: Remotes, localFetch: bool = true) {
    return this.sources.get(id)
      .then((component) => {
        if (component && localFetch) return component.toComponentVersion(id.version, this.name);
        return remotes.fetch([id], this, true)
          .then(([componentObjects, ]) => this.importSrc(componentObjects))
          .then(() => this.getExternal(id, remotes));
      });
  }

  getObjects(ids: BitId[]): Promise<ComponentObjects[]> {
    return this.importMany(ids)
      .then(versions => Promise.all(
        versions.map(version => version.toObjects(this.objects))));
  }

  getObject(hash: string): BitObject {
    return new Ref(hash).load(this.objects);
  }

  importMany(ids: BitIds): Promise<VersionDependencies[]> {
    const idsWithoutNils = removeNils(ids);
    if (R.isEmpty(idsWithoutNils)) return Promise.resolve([]);
    
    const [externals, locals] = splitWhen(id => id.isLocal(this.name), idsWithoutNils);
    
    return this.sources.getMany(locals)
      .then((localDefs) => {
        return Promise.all(localDefs.map((def) => {
          if (!def.component) throw new ComponentNotFound(def.id);
          return def.component.toVersionDependencies(def.id.version, this, def.id.scope);
        }))
        .then((versionDeps) => {
          return postImportHook({ ids: R.flatten(versionDeps.map(vd => vd.getAllIds())) })
          .then(() => this.remotes()
            .then(remotes => this.getExternalMany(externals, remotes))
            .then(externalDeps => versionDeps.concat(externalDeps))
          );
        });
      });
  }

  importManyOnes(ids: BitId[]): Promise<ComponentVersion[]> {
    const idsWithoutNils = removeNils(ids);
    if (R.isEmpty(idsWithoutNils)) return Promise.resolve([]);
    
    const [externals, locals] = splitWhen(id => id.isLocal(this.name), ids);
    
    return this.sources.getMany(locals)
      .then((localDefs) => {
        return Promise.all(localDefs.map((def) => {
          if (!def.component) throw new ComponentNotFound(def.id);
          return def.component.toComponentVersion(def.id.version, this.name);
        }))
        .then((componentVersionArr) => {
          return postImportHook({ ids: componentVersionArr.map(cv => cv.id.toString()) })
          .then(() => this.remotes()
            .then(remotes => this.getExternalOnes(externals, remotes))
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
        .then(remotes => this.getExternal(id, remotes));
    }
    
    return this.sources.get(id)
      .then((component) => {
        if (!component) throw new ComponentNotFound(id);
        return component.toVersionDependencies(id.version, this);
      });
  }

  get(id: BitId): Promise<ConsumerComponent> {
    return this.import(id)
      .then((versionDependencies) => {
        return versionDependencies.toConsumer(this.objects);
      });
  }

  getMany(ids: BitId[]): Promise<ConsumerComponent[]> {
    const idsWithoutNils = removeNils(ids);
    if (R.isEmpty(idsWithoutNils)) return Promise.resolve([]);
    return this.importMany(idsWithoutNils)
    .then((versionDependenciesArr: VersionDependencies[]) => {
      return Promise.all(
        versionDependenciesArr.map(versionDependencies => 
          versionDependencies.toConsumer(this.objects)
        )
      );
    });
  }

  // @TODO optimize ASAP
  modify(id: BitId): Promise<ComponentDependencies> {
    return this.import(id, true)
      .then((versionDependencies) => {
        const versions = versionDependencies.component.component.listVersions();
        const versionsP = this.importManyOnes(versions.map((version) => {
          const versionId = BitId.parse(id.toString());
          versionId.version = version.toString();
          return versionId;
        }));

        return Promise.all([versionDependencies.toObjects(this.objects), versionsP]);
      })
      .then(([componentObjects, ]) => {
        return this.export(componentObjects);
      }) 
      .then(() => {
        id.scope = this.name;
        return this.get(id);
      });
  }

  loadComponent(id: BitId): Promise<ConsumerComponent> {
    if (!id.isLocal(this.name)) {
      throw new Error('cannot load bit from remote scope, please import first');
    }

    return this.getOne(id)
      .then((component) => {
        if (!component) throw new ComponentNotFound(id);
        return component.toConsumer(this.objects);
      });
  }

  loadComponentLogs(id: BitId): Promise<{[number]: {message: string, date: string, hash: string}}> {
    return this.sources.get(id)
    .then((componentModel) => {
      if (!componentModel) throw new ComponentNotFound(id);
      return componentModel.collectLogs(this.objects);
    });
  }

  loadAllVersions(id: BitId): Promise<ConsumerComponent> {
    return this.sources.get(id)
    .then((componentModel) => {
      if (!componentModel) throw new ComponentNotFound(id);
      return componentModel.collectVersions(this.objects);
    });
  }

  getOne(id: BitId): Promise<ComponentVersion> {
    if (!id.isLocal(this.name)) {
      return this.remotes()
        .then(remotes => this.getExternalOne(id, remotes));
    }
    
    return this.sources.get(id)
      .then((component) => {
        if (!component) throw new ComponentNotFound(id);
        return component.toComponentVersion(id.version, this.name);
      });
  }

  exportAction(bitId: BitId, remoteName: string) {
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
    const envDir = opts && opts.bareScope ? this.getPath() : pathLib.dirname(this.getPath());
    if (opts && opts.pathOnly) {
      try {
        return bitJs.loadExact(bitId.toString(), envDir, opts);
      } catch (e) {
        throw new ResolutionException(e.message);
      }
    }

    try {
      const a = bitJs.loadExact(bitId.toString(), envDir);
      return a;
    } catch (e) {
      throw new ResolutionException(e.message);
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
  { ids: BitId[], consumer?: ?Consumer, verbose?: ?bool }): Promise<any> {
    const installPackageDependencies = (component: ConsumerComponent) => {
      const scopePath = this.getPath();
      const nodeModulesDir = consumer ? pathLib.dirname(scopePath) : scopePath;
      const deps = component.packageDependencies;
      
      loader.start(BEFORE_INSTALL_NPM_DEPENDENCIES);
      if (verbose) loader.stop(); // in order to show npm install output on verbose flag
      
      return Promise.all(
        R.values(
          R.mapObjIndexed(
            (value, key) => 
              npmInstall({ name: key, version: value, dir: nodeModulesDir, silent: !verbose })
          , deps)
        )
      ).then(() => component);
    };

    return this.getMany(ids)
    .then((components) => {
      if (consumer) {
        return consumer.writeToComponentsDir(flatten(components));
      }

      return this.writeToComponentsDir(flatten(components));
    })
    .then((components: ConsumerComponent[]) => {
      return Promise.all(components.map(installPackageDependencies));
    });
  }

  runComponentSpecs({ bitId, consumer, environment, save, verbose }: { 
    bitId: BitId,
    consumer?: ?Consumer,
    environment?: ?bool,
    save?: ?bool,
    verbose?: ?bool
  }): Promise<?Results> {
    if (!bitId.isLocal(this.name)) {
      throw new Error('cannot run specs on remote scopes');
    }

    return this.loadComponent(bitId)
      .then((component) => {
        return component.runSpecs({ scope: this, consumer, environment, save, verbose });
      });
  }

  build({ bitId, environment, save, consumer, verbose }: { 
    bitId: BitId,
    environment?: ?bool,
    save?: ?bool,
    consumer?: Consumer,
    verbose?: ?bool
  }): Promise<string> {
    return this.loadComponent(bitId)
      .then(component => component.build({ scope: this, environment, save, consumer, verbose }));
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
