/** @flow */
import * as pathLib from 'path';
import fs from 'fs';
import glob from 'glob';
import { merge } from 'ramda';
import { GlobalRemotes } from '../global-config';
import flattenDependencies from './flatten-dependencies';
import { Remotes } from '../remotes';
import types from './object-registrar';
import { propogateUntil, currentDirName, pathHas, readFile, first } from '../utils';
import { BIT_SOURCES_DIRNAME, BIT_HIDDEN_DIR } from '../constants';
import { ScopeJson, getPath as getScopeJsonPath } from './scope-json';
import AbstractBitJson from '../consumer/bit-json/abstract-bit-json';
import { ScopeNotFound, BitNotInScope } from './exceptions';
import { Source, Cache, Tmp, External, Environment } from './repositories';
import { SourcesMap, getPath as getDependenyMapPath } from './sources-map';
import SourceObject from './models/source';
import { BitId, BitIds } from '../bit-id';
import { Repository, Ref } from './objects';
import Bit from '../consumer/bit';
import BitDependencies from './bit-dependencies';

const pathHasScope = pathHas([BIT_SOURCES_DIRNAME, BIT_HIDDEN_DIR]);

export type ScopeDescriptor = {
  name: string
};

export type ScopeProps = {
  path: string,
  scopeJson: ScopeJson;
  created?: boolean;
  cache?: Cache;
  tmp?: Tmp;
  environment?: Environment;
  sources?: Source,
  external?: External;
  sourcesMap?: SourcesMap;
  objectsRepository?: Repository;
};

export default class Scope {
  external: External;
  created: boolean = false;
  cache: Cache;
  scopeJson: ScopeJson;
  tmp: Tmp;
  environment: Environment;
  sources: Source;
  path: string;
  objectsRepository: Repository;
  sourcesMap: SourcesMap;

  constructor(scopeProps: ScopeProps) {
    this.path = scopeProps.path;
    this.scopeJson = scopeProps.scopeJson;
    this.cache = scopeProps.cache || new Cache(this);
    this.sources = scopeProps.sources || new Source(this);
    this.created = scopeProps.created || false;
    this.tmp = scopeProps.tmp || new Tmp(this);
    this.objectsRepository = scopeProps.objectsRepository || new Repository(this, types());
    this.environment = scopeProps.environment || new Environment(this);
    this.external = scopeProps.external || new External(this);
    this.sourcesMap = scopeProps.sourcesMap || new SourcesMap(this);
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

  ls() {
    return this.sources.list();
  }

  // put(bit: Bit): Promise<BitDependencies> {
  //   bit.scope = this.name();
  //   bit.validateOrThrow();
  //   return this.remotes().then((remotes) => {
  //     return bit.dependencies()
  //       .fetch(this, remotes)
  //       .then((dependencies) => {
  //         dependencies = flattenDependencies(dependencies);
  //         return this.sources.setSource(bit, dependencies)
  //         // @TODO make the scope install the required env
  //           .then(() => this.ensureEnvironment(bit.bitJson))
  //           .then(() => bit.build(this))
  //           .then(() => this.sourcesMap.write())
  //           .then(() => {
  //             return new BitDependencies({ bit, dependencies });
  //           });
  //       });
  //   });
  // }

  put(): Promise<any> {
    const source = new SourceObject(new Buffer('module.exports = function(){ console.log() };'));
    this.objectsRepository.add(source);
    return this.objectsRepository.persist()
      .catch((err) => {
        console.log(err);
      })
      .then((res) => {
        return this.objectsRepository.load(new Ref('c1d44ff03aff1372856c281854f454e2e1d15b7c'))
        .then(a => {
          console.log(a);
        });
      });
  }

  getExternal(bitId: BitId, remotes: Remotes): Promise<BitDependencies> {
    return remotes.fetch([bitId])
      .then(bitDeps => first(bitDeps));
  }

  get(bitId: BitId): Promise<BitDependencies> {
    if (!bitId.isLocal(this.name())) {
      return this.remotes().then(remotes => this.getExternal(bitId, remotes));
    }
    
    bitId.version = this.sources.resolveVersion(bitId).toString();
    const dependencyList = this.sourcesMap.get(bitId);
    if (!dependencyList) throw new BitNotInScope();
    const bitIds = this.sourcesMap.getBitIds(dependencyList);
    
    return this.remotes().then((remotes) => {
      return bitIds.fetchOnes(this, remotes)
        .then((bits) => {
          return this.sources.loadSource(bitId)
            .then(bit => new BitDependencies({ bit, dependencies: bits }));
        });
    });
  }

  getOne(bitId: BitId): Promise<Bit> {
    return this.sources.loadSource(bitId);
  }

  manyOnes(bitIds: BitId[]): Promise<Bit[]> {
    return Promise.all(bitIds.map(bitId => this.getOne(bitId)));
  }

  push(bitId: BitId, remoteName: string) {
    return this.remotes().then((remotes) => {
      const remote = remotes.get(remoteName);
      return this.sources.loadSource(bitId)
        .then(bit => remote.push(bit))
        .then(() => this.clean(bitId));
    });
  }

  ensureDir() {
    return this.cache
      .ensureDir()
      .then(() => this.sources.ensureDir())
      .then(() => this.external.ensureDir())
      .then(() => this.tmp.ensureDir())
      .then(() => this.environment.ensureDir())
      .then(() => this.sourcesMap.write())
      .then(() => this.scopeJson.write(this.getPath()))
      .then(() => this.objectsRepository.ensureDir())
      .then(() => this); 
  }
  
  /**
   * list the bits in the sources directory
   **/
  listSources(): Promise<Bit[]> {
    return new Promise((resolve, reject) =>
      glob(pathLib.join('*', '*'), { cwd: this.sources.getPath() }, (err, files) => {
        if (err) reject(err);

        const bitsP = files.map(bitRawId =>
          this.getOne(BitId.parse(`@this/${bitRawId}`))
        );
        
        return Promise.all(bitsP)
        .then(resolve);
      })
    );
  }

  clean(bitId: BitId) {
    this.sources.clean(bitId);
    this.sourcesMap.delete(bitId);
    return this.sourcesMap.write();
  }

  getMany(bitIds: BitIds) {
    return Promise.all(bitIds.map((bitId) => {
      return this.get(bitId);
    }));
  }

  getPath() {
    return this.path;
  }

  loadEnvironment(bitId: BitId): Promise<any> {
    return this.environment.get(bitId);
  }

  writeToEnvironmentsDir(bit: Bit) {
    return this.environment.store(bit);
  }
  
  /**
   * check a bitJson compiler and tester, returns an empty promise and import environments if needed
   */
  ensureEnvironment(bitJson: AbstractBitJson): Promise<any> {
    return this.environment.ensureEnvironment(bitJson);
  }

  static create(path: string = process.cwd(), name: ?string) {
    if (pathHasScope(path)) return this.load(path);
    if (!name) name = currentDirName(); 
    const scopeJson = new ScopeJson({ name });
    return Promise.resolve(new Scope({ path, created: true, scopeJson }));
  }

  static load(absPath: string): Promise<Scope> {
    let scopePath = propogateUntil(absPath, pathHasScope);
    if (!scopePath) throw new ScopeNotFound();
    if (fs.existsSync(pathLib.join(scopePath, BIT_HIDDEN_DIR))) {
      scopePath = pathLib.join(scopePath, BIT_HIDDEN_DIR);
    }
    const path = scopePath;

    return Promise.all([
      readFile(getDependenyMapPath(scopePath)), 
      readFile(getScopeJsonPath(scopePath))
    ])
      .then(([rawDependencyMap, rawScopeJson]) => {
        const scopeJson = ScopeJson.loadFromJson(rawScopeJson.toString('utf8'));
        const scope = new Scope({ path, scopeJson }); 
        scope.sourcesMap = SourcesMap.load(JSON.parse(rawDependencyMap.toString('utf8')), scope);
        return scope;
      });
  }
}
