/** @flow */
import * as pathLib from 'path';
import fs from 'fs';
import { merge, tap } from 'ramda';
import { GlobalRemotes } from '../global-config';
import flattenDependencies from './flatten-dependencies';
import ComponentObjects from './component-objects';
import ComponentModel from './models/component';
import { Remotes } from '../remotes';
import types from './object-registrar';
import { propogateUntil, currentDirName, pathHas, readFile } from '../utils';
import { BIT_HIDDEN_DIR, LATEST, OBJECTS_DIR } from '../constants';
import { ScopeJson, getPath as getScopeJsonPath } from './scope-json';
import { ScopeNotFound, ComponentNotFound } from './exceptions';
import { Tmp, Environment } from './repositories';
import { BitId, BitIds } from '../bit-id';
import Component from '../consumer/component';
import ComponentVersion from './component-version';
import { Repository, Ref, BitObject } from './objects';
import ComponentDependencies from './component-dependencies';
import VersionDependencies from './version-dependencies';
import SourcesRepository from './repositories/sources';

const pathHasScope = pathHas([OBJECTS_DIR, BIT_HIDDEN_DIR]);

export type ScopeDescriptor = {
  name: string
};

export type ScopeProps = {
  path: string,
  scopeJson: ScopeJson;
  created?: boolean;
  tmp?: Tmp;
  environment?: Environment;
  sources?: SourcesRepository;
  objects?: Repository;
};

export default class Scope {
  created: boolean = false;
  scopeJson: ScopeJson;
  tmp: Tmp;
  environment: Environment;
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
    this.environment = scopeProps.environment || new Environment(this);
  }

  get groupName(): ?string {
    if (!this.scopeJson.groupName) return null;
    return this.scopeJson.groupName;
  }

  hash() {
    return this.name();
  }

  name() {
    return this.scopeJson.name;
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
      name: this.name()
    };
  }

  toConsumerComponents(components: ComponentModel[]): Component {
    return Promise.all(components.map(c =>
      c.toConsumerComponent(c.latest().toString(), this.name(), this.objects))
    );
  }

  list(scopeName: ?string) {
    if (scopeName) {
      return this.remotes()
      .then(remotes =>
        // $FlowFixMe
        remotes.resolve(scopeName, this.name())
        .then(remote => remote.list())
      );
    }

    return this.objects.list()
    .then(components => this.toConsumerComponents(components));
  }

  listStage() {
    return this.objects.list()
    .then(components => this.toConsumerComponents(
      components.filter(c => c.scope === this.name())
    ));
  }

  put(consumerComponent: Component, message: string): Promise<ComponentDependencies> {
    consumerComponent.scope = this.name();
    return this.importMany(consumerComponent.dependencies)
      .then((dependencies) => {
        dependencies = flattenDependencies(dependencies);
        return this.sources.addSource(consumerComponent, dependencies, message)
        // // @TODO make the scope install the required env
          // .then(() => this.ensureEnvironment({ testerId: , compilerId }))
          .then((component) => {
            return this.objects.persist()
              .then(() => component.toVersionDependencies(LATEST, this))
              .then(deps => deps.toConsumer(this.objects));
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
      .then(() => this.getObjects(component.toComponentVersion(LATEST, this.name()).id));
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

  getExternalOne(id: BitId, remotes: Remotes) {
    return this.sources.get(id)
      .then((component) => {
        if (component) return component.toComponentVersion(id.version, this.name());
        return remotes.fetch([id], this, true)
          .then(([componentObjects, ]) => this.importSrc(componentObjects))
          .then(() => this.getExternal(id, remotes));
      });
  }

  getObjects(id: BitId): Promise<ComponentObjects> {
    return this.import(id)
      .then(versionDeps => versionDeps.toObjects(this.objects));
  }

  getObject(hash: string): BitObject {
    return new Ref(hash).load(this.objects);
  }

  import(id: BitId): Promise<VersionDependencies> {
    if (!id.isLocal(this.name())) {
      return this.remotes()
        .then(remotes => this.getExternal(id, remotes));
    }
    
    return this.sources.get(id)
      .then((component) => {
        if (!component) throw new ComponentNotFound();
        return component.toVersionDependencies(id.version, this);
      });
  }
 
  get(id: BitId): Promise<ComponentDependencies> {
    return this.import(id)
      .then((versionDependencies) => {
        return versionDependencies.toConsumer(this.objects);
      });
  }

  modify(id: BitId): Promise<ComponentDependencies> {
    return this.import(id, true)
      .then(versionDependencies => versionDependencies.toObjects(this.objects))
      .then(componentObjects => this.export(componentObjects)) 
      .then(() => {
        id.scope = this.name();
        return this.get(id);
      });
  }

  loadComponent(id: BitId) {
    if (!id.isLocal(this.name())) {
      return this.remotes()
        .then((remotes) => {
          return remotes.resolve(id.scope, this)
          .then(remote => remote.show());
          // @TODO - remote get
        });
    }
    
    return this.sources.get(id)
      .then(component => component.toConsumerComponent(id.version, this.name(), this.objects));
  }

  loadComponentLogs(id: BitId) {
    return this.sources.get(id)
    .then(componentModel => componentModel.collectVersions(this.objects));
  }

  getOne(id: BitId): Promise<ComponentVersion> {
    if (!id.isLocal(this.name())) {
      return this.remotes()
        .then(remotes => this.getExternalOne(id, remotes));
    }
    
    return this.sources.get(id)
      .then(component => component.toComponentVersion(id.version, this.name()));
  }

  getOneObject(id: BitId): Promise<ComponentObjects> {
    return this.getOne(id)
      .then(component => component.toObjects(this.objects));
  }

  manyOneObjects(ids: BitId[]): Promise<ComponentObjects[]> {
    return Promise.all(ids.map(id => this.getOneObject(id)));
  }

  manyOnes(bitIds: BitId[]): Promise<ComponentVersion[]> {
    return Promise.all(bitIds.map(bitId => this.getOne(bitId)));
  }

  exportAction(bitId: BitId, remoteName: string) {
    return this.remotes().then((remotes) => {
      return remotes.resolve(remoteName, this).then((remote) => {
        return this.sources.getObjects(bitId)
        .then(component => remote.push(component)
        .then(objects => this.importSrc(objects))
        .then(() => {
          bitId.scope = remoteName;
          return this.get(bitId);
        }));
      });
    });
  }

  ensureDir() {
    return this.tmp
      .ensureDir()
      .then(() => this.environment.ensureDir())
      .then(() => this.scopeJson.write(this.getPath()))
      .then(() => this.objects.ensureDir())
      .then(() => this); 
  }

  clean(bitId: BitId) {
    return this.sources.clean(bitId);
  }

  getManyObjects(ids: BitIds) {
    return Promise.all(ids.map(id => this.getObjects(id)));
  }

  importMany(ids: BitIds): Promise<VersionDependencies[]> {
    return Promise.all(ids.map(bitId => this.import(bitId)));
  }

  getPath() {
    return this.path;
  }

  loadEnvironment(bitId: BitId): Promise<any> {
    return this.environment.get(bitId);
  }

  writeToEnvironmentsDir(component: Component) {
    return this.environment.store(component);
  }
  
  /**
   * check a bitJson compiler and tester, returns an empty promise and import environments if needed
   */
  ensureEnvironment({ testerId, compilerId }: any): Promise<any> {
    return this.environment.ensureEnvironment({ testerId, compilerId });
  }

  static create(path: string = process.cwd(), name: ?string, groupName: ?string) {
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
