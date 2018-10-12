/** @flow */
import semver from 'semver';
import uniqBy from 'lodash.uniqby';
import { equals, zip, fromPairs, keys, map, prop, forEachObjIndexed, isEmpty, clone } from 'ramda';
import { Ref, BitObject } from '../objects';
import { ScopeMeta, Source } from '.';
import { VersionNotFound, VersionAlreadyExists } from '../exceptions';
import { forEach, empty, mapObject, values, diff, filterObject, getStringifyArgs } from '../../utils';
import Version from './version';
import {
  DEFAULT_LANGUAGE,
  DEFAULT_BINDINGS_PREFIX,
  DEFAULT_BIT_RELEASE_TYPE,
  DEFAULT_BIT_VERSION
} from '../../constants';
import BitId from '../../bit-id/bit-id';
import VersionParser from '../../version';
import ConsumerComponent from '../../consumer/component';
import Scope from '../scope';
import Repository from '../objects/repository';
import ComponentVersion from '../component-version';
import { SourceFile, Dist, License } from '../../consumer/component/sources';
import ComponentObjects from '../component-objects';
import SpecsResults from '../../consumer/specs-results';
import logger from '../../logger/logger';
import GeneralError from '../../error/general-error';
import CompilerExtension from '../../extensions/compiler-extension';
import TesterExtension from '../../extensions/tester-extension';
import type { ManipulateDirItem } from '../../consumer/component-ops/manipulate-dir';
import VersionDependencies from '../version-dependencies';

type State = {
  versions?: {
    [string]: {
      local?: boolean // whether a component was changed locally
    }
  }
};

type Versions = { [string]: Ref };

export type ComponentProps = {
  scope?: string,
  name: string,
  versions?: Versions,
  lang?: string,
  deprecated?: boolean,
  bindingPrefix?: string,
  /**
   * @deprecated since 0.12.6. It's currently stored in 'state' attribute
   */
  local?: boolean, // get deleted after export
  state?: State // get deleted after export
};

/**
 * we can't rename the class as ModelComponent because old components are already saved in the model
 * with 'Component' in their headers. see object-registrar.types()
 */
export default class Component extends BitObject {
  scope: ?string;
  name: string;
  versions: Versions;
  lang: string;
  deprecated: boolean;
  bindingPrefix: string;
  local: ?boolean;
  state: State;

  constructor(props: ComponentProps) {
    super();
    if (!props.name) throw new TypeError('Model Component constructor expects to get a name parameter');
    this.scope = props.scope || null;
    this.name = props.name;
    this.versions = props.versions || {};
    this.lang = props.lang || DEFAULT_LANGUAGE;
    this.deprecated = props.deprecated || false;
    this.bindingPrefix = props.bindingPrefix || DEFAULT_BINDINGS_PREFIX;
    this.local = props.local;
    this.state = props.state || {};
  }

  get versionArray(): Ref[] {
    return values(this.versions);
  }

  listVersions(sort: 'ASC' | 'DESC'): string[] {
    const versions = Object.keys(this.versions);
    if (!sort) return versions;
    if (sort === 'ASC') {
      return versions.sort(semver.compare);
    }

    return versions.sort(semver.compare).reverse();
  }

  hasVersion(version: string): boolean {
    return !!this.versions[version];
  }

  /**
   * returns only the versions that exist in both components (regardless whether the hash are the same)
   * e.g. this.component = [0.0.1, 0.0.2, 0.0.3], other component = [0.0.3, 0.0.4]. it returns only [0.0.3].
   * also, in case it is coming from 'bit import', the version must be locally changed.
   * otherwise, it doesn't matter whether the hashes are different.
   */
  _getComparableVersionsObjects(
    otherComponent: Component, // in case of merging, the otherComponent is the existing component, and "this" is the incoming component
    local: boolean // for 'bit import' the local is true, for 'bit export' the local is false
  ): { thisComponentVersions: Versions, otherComponentVersions: Versions } {
    const otherLocalVersion = otherComponent.getLocalVersions();
    const otherComponentVersions = filterObject(
      otherComponent.versions,
      (val, key) => Object.keys(this.versions).includes(key) && (!local || otherLocalVersion.includes(key))
    );
    const thisComponentVersions = filterObject(
      this.versions,
      (val, key) => Object.keys(otherComponentVersions).includes(key) && (!local || otherLocalVersion.includes(key))
    );
    return { thisComponentVersions, otherComponentVersions };
  }

  compatibleWith(component: Component, local: boolean): boolean {
    const { thisComponentVersions, otherComponentVersions } = this._getComparableVersionsObjects(component, local);
    return equals(thisComponentVersions, otherComponentVersions);
  }

  diffWith(component: Component, local: boolean): string[] {
    const { thisComponentVersions, otherComponentVersions } = this._getComparableVersionsObjects(component, local);
    return Object.keys(thisComponentVersions).filter(
      version => thisComponentVersions[version].hash !== otherComponentVersions[version].hash
    );
  }

  latest(): string {
    if (empty(this.versions)) return '0.0.0';
    return semver.maxSatisfying(this.listVersions(), '*');
  }

  /**
   * Return the lateset version which actuall exists in the scope
   * (exists means the object itself exists)
   * This relevant for cases when the component version array has few versions
   * but we don't have all the refs in the object
   *
   * @returns {number}
   * @memberof Component
   */
  latestExisting(repository: Repository): string {
    if (empty(this.versions)) return '0.0.0';
    const versions = this.listVersions('ASC');
    let version = null;
    let versionStr = null;
    while (!version && versions && versions.length) {
      versionStr = versions.pop();
      version = this.loadVersionSync(versionStr, repository, false);
    }
    return versionStr || '0.0.0';
  }

  collectLogs(repo: Repository): Promise<{ [number]: { message: string, date: string, hash: string } }> {
    return repo.findMany(this.versionArray).then((versions) => {
      const indexedLogs = fromPairs(zip(keys(this.versions), map(prop('log'), versions)));
      return indexedLogs;
    });
  }

  /**
   * when bitMap is passed, it got called from the consumer and as such it strips the sharedDir
   */
  collectVersions(repo: Repository): Promise<ConsumerComponent[]> {
    return Promise.all(
      this.listVersions().map((versionNum) => {
        return this.toConsumerComponent(versionNum, this.scope, repo);
      })
    );
  }

  getVersionToAdd(releaseType: string = DEFAULT_BIT_RELEASE_TYPE, exactVersion: ?string): string {
    if (exactVersion && this.versions[exactVersion]) {
      throw new VersionAlreadyExists(exactVersion, this.id());
    }
    return exactVersion || this.version(releaseType);
  }

  /**
   * if exactVersion is defined, add exact version instead of using the semver mechanism
   */
  addVersion(version: Version, releaseType: string = DEFAULT_BIT_RELEASE_TYPE, exactVersion: ?string): string {
    const versionToAdd = this.getVersionToAdd(releaseType, exactVersion);
    this.versions[versionToAdd] = version.hash();
    this.markVersionAsLocal(versionToAdd);
    return versionToAdd;
  }

  version(releaseType: string = DEFAULT_BIT_RELEASE_TYPE) {
    const latest = this.latest();
    if (latest) return semver.inc(latest, releaseType);
    return DEFAULT_BIT_VERSION;
  }

  id(): string {
    return this.scope ? [this.scope, this.name].join('/') : this.name;
  }

  toBitId(): BitId {
    return new BitId({ scope: this.scope, name: this.name });
  }

  toBitIdWithLatestVersion(): BitId {
    return new BitId({ scope: this.scope, name: this.name, version: this.latest() });
  }

  toObject() {
    function versions(vers: Versions) {
      const obj = {};
      forEach(vers, (ref, version) => {
        obj[version] = ref.toString();
      });
      return obj;
    }

    const componentObject = {
      name: this.name,
      scope: this.scope,
      versions: versions(this.versions),
      lang: this.lang,
      deprecated: this.deprecated,
      bindingPrefix: this.bindingPrefix
    };
    if (this.local) componentObject.local = this.local;
    if (!isEmpty(this.state)) componentObject.state = this.state;

    return componentObject;
  }

  async loadVersion(version: string, repository: Repository): Promise<Version> {
    const versionRef: Ref = this.versions[version];
    if (!versionRef) throw new VersionNotFound(version);
    return versionRef.load(repository);
  }

  loadVersionSync(version: string, repository: Repository, throws: boolean = true): Version {
    const versionRef: Ref = this.versions[version];
    if (!versionRef) throw new VersionNotFound(version);
    return versionRef.loadSync(repository, throws);
  }

  collectObjects(repo: Repository): Promise<ComponentObjects> {
    return Promise.all([this.asRaw(repo), this.collectRaw(repo)]).then(
      ([rawComponent, objects]) => new ComponentObjects(rawComponent, objects)
    );
  }

  /**
   * delete all versions objects of the component from the filesystem.
   * if deepRemove is true, it deletes also the refs associated with the deleted versions.
   * finally, it deletes the component object itself
   *
   * @param {Repository} repo
   * @param {boolean} [deepRemove=false] - whether remove all the refs or only the version array
   * @returns {Promise}
   * @memberof Component
   */
  remove(repo: Repository, deepRemove: boolean = false): Promise<boolean[]> {
    logger.debug(`models.component.remove: removing a component ${this.id()} from a local scope`);
    const objectRefs = deepRemove ? this.collectExistingRefs(repo, false).filter(x => x) : this.versionArray;
    const uniqRefs = uniqBy(objectRefs, 'hash');
    return repo.removeMany(uniqRefs.concat([this.hash()]));
  }

  /**
   * to delete a version from a component, don't call this method directly. Instead, use sources.removeVersion()
   */
  async removeVersion(repo: Repository, version: string): Promise<Component> {
    const objectRefs = this.versions[version];
    delete this.versions[version];
    if (this.state.versions && this.state.versions[version]) delete this.state.versions[version];
    await repo.removeMany([objectRefs.hash]);
    return this;
  }

  toComponentVersion(versionStr: string): ComponentVersion {
    const versionNum = VersionParser.parse(versionStr).resolve(this.listVersions());

    if (!this.versions[versionNum]) {
      throw new GeneralError(
        `the version ${versionNum} does not exist in ${this.listVersions().join('\n')}, versions array`
      );
    }
    return new ComponentVersion(this, versionNum);
  }

  /**
   * convert a ModelComponent of a specific version to ConsumerComponent
   * when it's being called from the Consumer, some manipulation are done on the component, such
   * as stripping the originallySharedDir and adding wrapDir.
   * when it's being called from the Scope, no manipulations are done.
   *
   * @see sources.consumerComponentToVersion() for the opposite action.
   */
  async toConsumerComponent(
    versionStr: string,
    scopeName: string,
    repository: Repository,
    manipulateDirData: ?(ManipulateDirItem[])
  ): Promise<ConsumerComponent> {
    logger.debug(`model-component, converting ${this.id()}, version: ${versionStr} to ConsumerComponent`);
    const componentVersion = this.toComponentVersion(versionStr);
    const version: Version = await componentVersion.getVersion(repository);
    const loadFileInstance = ClassName => async (file) => {
      const loadP = file.file.load(repository);
      const content: Source = ((await loadP: any): Source);
      if (!content) throw new GeneralError(`failed loading file ${file.relativePath} from the model`);
      return new ClassName({ base: '.', path: file.relativePath, contents: content.contents, test: file.test });
    };
    const filesP = version.files ? Promise.all(version.files.map(loadFileInstance(SourceFile))) : null;
    const distsP = version.dists ? Promise.all(version.dists.map(loadFileInstance(Dist))) : null;
    const scopeMetaP = scopeName ? ScopeMeta.fromScopeName(scopeName).load(repository) : Promise.resolve();
    const log = version.log || null;
    const compilerP = CompilerExtension.loadFromModelObject(version.compiler, repository);
    const testerP = TesterExtension.loadFromModelObject(version.tester, repository);
    const [files, dists, scopeMeta, compiler, tester] = await Promise.all([
      filesP,
      distsP,
      scopeMetaP,
      compilerP,
      testerP
    ]);
    // when generating a new ConsumerComponent out of Version, it is critical to make sure that
    // all objects are cloned and not copied by reference. Otherwise, every time the
    // ConsumerComponent instance is changed, the Version will be changed as well, and since
    // the Version instance is saved in the Repository._cache, the next time a Version instance
    // is retrieved, it'll be different than the first time.
    const consumerComponent = new ConsumerComponent({
      name: this.name,
      version: componentVersion.version,
      scope: this.scope,
      lang: this.lang,
      bindingPrefix: this.bindingPrefix,
      mainFile: version.mainFile || null,
      compiler,
      tester,
      detachedCompiler: version.detachedCompiler,
      detachedTester: version.detachedTester,
      dependencies: version.dependencies.getClone(),
      devDependencies: version.devDependencies.getClone(),
      compilerDependencies: version.compilerDependencies.getClone(),
      testerDependencies: version.testerDependencies.getClone(),
      flattenedDependencies: version.flattenedDependencies.clone(),
      flattenedDevDependencies: version.flattenedDevDependencies.clone(),
      flattenedCompilerDependencies: version.flattenedCompilerDependencies.clone(),
      flattenedTesterDependencies: version.flattenedTesterDependencies.clone(),
      packageDependencies: clone(version.packageDependencies),
      devPackageDependencies: clone(version.devPackageDependencies),
      peerPackageDependencies: clone(version.peerPackageDependencies),
      compilerPackageDependencies: clone(version.compilerPackageDependencies),
      testerPackageDependencies: clone(version.testerPackageDependencies),
      files,
      dists,
      docs: version.docs,
      license: scopeMeta ? License.deserialize(scopeMeta.license) : null, // todo: make sure we have license in case of local scope
      specsResults: version.specsResults ? version.specsResults.map(res => SpecsResults.deserialize(res)) : null,
      log,
      customResolvedPaths: clone(version.customResolvedPaths),
      deprecated: this.deprecated
    });
    if (manipulateDirData) {
      consumerComponent.stripOriginallySharedDir(manipulateDirData);
      consumerComponent.addWrapperDir(manipulateDirData);
    }

    return consumerComponent;
  }

  refs(): Ref[] {
    return values(this.versions);
  }

  replaceRef(oldRef: Ref, newRef: Ref) {
    const replace = (value, key) => {
      if (value === oldRef.hash) {
        this.versions[key] = newRef.hash;
      }
    };
    forEachObjIndexed(replace, this.versions);
  }

  validateBeforePersisting(componentStr: string): void {
    logger.debug(`validating component object: ${this.hash().hash} ${this.id()}`);
    const component = Component.parse(componentStr);
    component.validate();
  }

  toBuffer(pretty: boolean) {
    const args = getStringifyArgs(pretty);
    const obj = this.toObject();
    const str = JSON.stringify(obj, ...args);
    if (this.validateBeforePersist) this.validateBeforePersisting(str);
    return Buffer.from(str);
  }

  toVersionDependencies(version: string, scope: Scope, source: string): Promise<VersionDependencies> {
    const versionComp = this.toComponentVersion(version);
    return versionComp.toVersionDependencies(scope, source);
  }

  /**
   * Clear data that is relevant only for the local scope and should not be moved to the remote scope
   */
  clearStateData() {
    this.local = false; // backward compatibility for components created before 0.12.6
    this.state = {};
  }

  markVersionAsLocal(version: string) {
    if (!this.state.versions) this.state = { versions: {} };
    // $FlowFixMe
    if (!this.state.versions[version]) this.state.versions[version] = {};
    // $FlowFixMe
    this.state.versions[version].local = true;
  }

  getLocalVersions(): string[] {
    if (isEmpty(this.state) || isEmpty(this.state.versions)) return [];
    return Object.keys(this.state.versions).filter(version => this.state.versions[version].local);
  }

  isLocallyChanged(): boolean {
    if (this.local) return true; // backward compatibility for components created before 0.12.6
    if (isEmpty(this.state) || isEmpty(this.state.versions)) return false;
    // $FlowFixMe
    const localVersions = this.getLocalVersions();
    return localVersions.length > 0;
  }

  static parse(contents: string): Component {
    const rawComponent = JSON.parse(contents);
    return Component.from({
      name: rawComponent.box ? `${rawComponent.box}/${rawComponent.name}` : rawComponent.name,
      scope: rawComponent.scope,
      versions: mapObject(rawComponent.versions, val => Ref.from(val)),
      lang: rawComponent.lang,
      deprecated: rawComponent.deprecated,
      bindingPrefix: rawComponent.bindingPrefix,
      local: rawComponent.local,
      state: rawComponent.state
    });
  }

  static from(props: ComponentProps): Component {
    return new Component(props);
  }

  static fromBitId(bitId: BitId): Component {
    if (bitId.box) throw new Error('component.fromBitId, bitId should not have the "box" property populated');
    return new Component({
      name: bitId.name,
      scope: bitId.scope
    });
  }

  validate(): void {
    const message = 'unable to save Component object';
    if (!this.name) throw new GeneralError(`${message} the name is missing`);
  }
}
