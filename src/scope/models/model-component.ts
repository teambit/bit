import * as semver from 'semver';
import { equals, zip, fromPairs, keys, forEachObjIndexed, isEmpty, clone } from 'ramda';
import { Ref, BitObject } from '../objects';
import ScopeMeta from './scopeMeta';
import Source from './source';
import { VersionNotFound, VersionAlreadyExists } from '../exceptions';
import { forEach, empty, mapObject, filterObject, getStringifyArgs } from '../../utils';
import Version from './version';
import {
  DEFAULT_LANGUAGE,
  DEFAULT_BINDINGS_PREFIX,
  DEFAULT_BIT_RELEASE_TYPE,
  DEFAULT_BIT_VERSION,
  COMPILER_ENV_TYPE,
  TESTER_ENV_TYPE
} from '../../constants';
import BitId from '../../bit-id/bit-id';
import ConsumerComponent from '../../consumer/component';
import Repository from '../objects/repository';
import ComponentVersion from '../component-version';
import { SourceFile, Dist, License } from '../../consumer/component/sources';
import ComponentObjects from '../component-objects';
import SpecsResults from '../../consumer/specs-results';
import logger from '../../logger/logger';
import GeneralError from '../../error/general-error';
import { ManipulateDirItem } from '../../consumer/component-ops/manipulate-dir';
import versionParser from '../../version/version-parser';
import ComponentOverrides from '../../consumer/config/component-overrides';
import { makeEnvFromModel } from '../../legacy-extensions/env-factory';
import ShowDoctorError from '../../error/show-doctor-error';
import ValidationError from '../../error/validation-error';
import { Artifact } from '../../consumer/component/sources/artifact';

type State = {
  versions?: {
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    [version: string]: {
      local?: boolean; // whether a component was changed locally
    };
  };
};

// @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
type Versions = { [version: string]: Ref };
export type ScopeListItem = { url: string; name: string; date: string };

export type ComponentLogs = { [key: number]: { message: string; date: string; hash: string } | null | undefined };

export type ComponentProps = {
  scope: string | null | undefined;
  name: string;
  versions?: Versions;
  lang: string;
  deprecated: boolean;
  bindingPrefix: string;
  /**
   * @deprecated since 0.12.6. It's currently stored in 'state' attribute
   */
  local?: boolean; // get deleted after export
  state?: State; // get deleted after export
  scopesList?: ScopeListItem[];
};

const VERSION_ZERO = '0.0.0';

/**
 * we can't rename the class as ModelComponent because old components are already saved in the model
 * with 'Component' in their headers. see object-registrar.types()
 */
// TODO: FIX me .parser
// @ts-ignore
export default class Component extends BitObject {
  scope: string | null | undefined;
  name: string;
  versions: Versions;
  lang: string;
  deprecated: boolean;
  bindingPrefix: string;
  local: boolean | null | undefined;
  state: State;
  scopesList: ScopeListItem[];

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
    this.scopesList = props.scopesList || [];
  }

  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  get versionArray(): Ref[] {
    return Object.values(this.versions);
  }

  listVersions(sort?: 'ASC' | 'DESC'): string[] {
    const versions = Object.keys(this.versions);
    if (!sort) return versions;
    if (sort === 'ASC') {
      return versions.sort(semver.compare);
    }

    return versions.sort(semver.compare).reverse();
  }

  hasVersion(version: string): boolean {
    return Boolean(this.versions[version]);
  }

  /**
   * add a new remote if it is not there already
   */
  addScopeListItem(scopeListItem: ScopeListItem): void {
    if (!scopeListItem.name || !scopeListItem.url || !scopeListItem.date) {
      throw new TypeError(
        `model-component.addRemote get an invalid remote. name: ${scopeListItem.name}, url: ${scopeListItem.url}, date: ${scopeListItem.date}`
      );
    }
    if (!this.scopesList.find(r => r.url === scopeListItem.url)) {
      this.scopesList.push(scopeListItem);
    }
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
  ): { thisComponentVersions: Versions; otherComponentVersions: Versions } {
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
    if (empty(this.versions)) return VERSION_ZERO;
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    return semver.maxSatisfying(this.listVersions(), '*')!;
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
    if (empty(this.versions)) return VERSION_ZERO;
    const versions = this.listVersions('ASC');
    let version = null;
    let versionStr = null;
    while (!version && versions && versions.length) {
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      versionStr = versions.pop();
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      version = this.loadVersionSync(versionStr, repository, false);
    }
    return versionStr || VERSION_ZERO;
  }

  async collectLogs(
    repo: Repository
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  ): Promise<ComponentLogs> {
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    const versions: Version[] = await repo.findMany(this.versionArray);
    const logValues = versions.map(version => (version ? version.log : { message: '<no-data-available>' }));
    const indexedLogs = fromPairs(zip(keys(this.versions), logValues));
    return indexedLogs;
  }

  /**
   * when bitMap is passed, it got called from the consumer and as such it strips the sharedDir
   */
  collectVersions(repo: Repository): Promise<ConsumerComponent[]> {
    return Promise.all(
      this.listVersions().map(versionNum => {
        // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
        return this.toConsumerComponent(versionNum, this.scope, repo);
      })
    );
  }

  /**
   * if exactVersion is defined, add exact version instead of using the semver mechanism
   */
  getVersionToAdd(
    releaseType: semver.ReleaseType = DEFAULT_BIT_RELEASE_TYPE,
    exactVersion: string | null | undefined
  ): string {
    if (exactVersion && this.versions[exactVersion]) {
      throw new VersionAlreadyExists(exactVersion, this.id());
    }
    return exactVersion || this.version(releaseType);
  }

  addVersion(version: Version, versionToAdd: string): string {
    this.versions[versionToAdd] = version.hash();
    this.markVersionAsLocal(versionToAdd);
    return versionToAdd;
  }

  version(releaseType: semver.ReleaseType = DEFAULT_BIT_RELEASE_TYPE): string {
    const latest = this.latest();
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    if (latest) return semver.inc(latest, releaseType)!;
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

  toBitIdWithLatestVersionAllowNull(): BitId {
    const id = this.toBitIdWithLatestVersion();
    return id.version === VERSION_ZERO ? id.changeVersion(undefined) : id;
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
      bindingPrefix: this.bindingPrefix,
      remotes: this.scopesList
    };
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    if (this.local) componentObject.local = this.local;
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    if (!isEmpty(this.state)) componentObject.state = this.state;

    return componentObject;
  }

  async loadVersion(version: string, repository: Repository): Promise<Version> {
    const versionRef: Ref = this.versions[version];
    if (!versionRef) throw new VersionNotFound(version);
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    return versionRef.load(repository);
  }

  loadVersionSync(version: string, repository: Repository, throws = true): Version {
    const versionRef: Ref = this.versions[version];
    if (!versionRef) throw new VersionNotFound(version);
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    return versionRef.loadSync(repository, throws);
  }

  async collectVersionsObjects(repo: Repository, versions: string[]): Promise<Buffer[]> {
    const collectRefs = async (): Promise<Ref[]> => {
      const refsCollection: Ref[] = [];

      async function addRefs(object: BitObject) {
        const refs = object.refs();
        const objs = await Promise.all(refs.map(ref => ref.load(repo, true)));
        refsCollection.push(...refs);
        await Promise.all(objs.map(obj => addRefs(obj)));
      }

      const versionsRefs = versions.map(version => this.versions[version]);
      refsCollection.push(...versionsRefs);
      const versionsObjects = await Promise.all(versions.map(version => this.versions[version].load(repo)));
      await Promise.all(versionsObjects.map(versionObject => addRefs(versionObject)));
      return refsCollection;
    };
    const refs = await collectRefs();
    return Promise.all(refs.map(ref => ref.loadRaw(repo)));
  }

  collectObjects(repo: Repository): Promise<ComponentObjects> {
    return Promise.all([this.asRaw(repo), this.collectRaw(repo)])
      .then(([rawComponent, objects]) => new ComponentObjects(rawComponent, objects))
      .catch(err => {
        if (err.code === 'ENOENT') {
          throw new Error(
            `fatal: an object of "${this.id()}" was not found at ${err.path}\nplease try to re-import the component`
          );
        }
        throw err;
      });
  }

  /**
   * to delete a version from a component, don't call this method directly. Instead, use sources.removeVersion()
   */
  removeVersion(version: string): Ref {
    const objectRef = this.versions[version];
    delete this.versions[version];
    if (this.state.versions && this.state.versions[version]) delete this.state.versions[version];
    return objectRef;
  }

  toComponentVersion(versionStr: string): ComponentVersion {
    const versionNum = versionParser(versionStr).resolve(this.listVersions());

    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    if (!this.versions[versionNum!]) {
      throw new ShowDoctorError(
        `the version ${versionNum} does not exist in ${this.listVersions().join('\n')}, versions array`
      );
    }
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    return new ComponentVersion(this, versionNum!);
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
    manipulateDirData: ManipulateDirItem[] | null | undefined
  ): Promise<ConsumerComponent> {
    logger.debug(`model-component, converting ${this.id()}, version: ${versionStr} to ConsumerComponent`);
    const componentVersion = this.toComponentVersion(versionStr);
    const version: Version = await componentVersion.getVersion(repository);
    const loadFileInstance = ClassName => async file => {
      const loadP = file.file.load(repository);
      const content: Source = await loadP;
      if (!content) throw new ShowDoctorError(`failed loading file ${file.relativePath} from the model`);
      return new ClassName({ base: '.', path: file.relativePath, contents: content.contents, test: file.test });
    };
    const filesP = version.files ? Promise.all(version.files.map(loadFileInstance(SourceFile))) : null;
    const distsP = version.dists ? Promise.all(version.dists.map(loadFileInstance(Dist))) : null;
    const scopeMetaP = scopeName ? ScopeMeta.fromScopeName(scopeName).load(repository) : Promise.resolve();
    const log = version.log || null;
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    const compilerP = makeEnvFromModel(COMPILER_ENV_TYPE, version.compiler, repository);
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    const testerP = makeEnvFromModel(TESTER_ENV_TYPE, version.tester, repository);
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    const [files, dists, scopeMeta, compiler, tester] = await Promise.all([
      filesP,
      distsP,
      scopeMetaP,
      compilerP,
      testerP
    ]);

    const extensions = version.extensions.clone();
    await Promise.all(
      extensions.map(async extension => {
        extension.artifacts = await Promise.all(extension.artifacts.map(loadFileInstance(Artifact)));
      })
    );

    const bindingPrefix = this.bindingPrefix === 'bit' ? '@bit' : this.bindingPrefix;
    // when generating a new ConsumerComponent out of Version, it is critical to make sure that
    // all objects are cloned and not copied by reference. Otherwise, every time the
    // ConsumerComponent instance is changed, the Version will be changed as well, and since
    // the Version instance is saved in the Repository._cache, the next time a Version instance
    // is retrieved, it'll be different than the first time.
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    const consumerComponent = new ConsumerComponent({
      name: this.name,
      version: componentVersion.version,
      scope: this.scope,
      lang: this.lang,
      bindingPrefix,
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      mainFile: version.mainFile || null,
      compiler,
      tester,
      dependencies: version.dependencies.getClone(),
      devDependencies: version.devDependencies.getClone(),
      flattenedDependencies: version.flattenedDependencies.clone(),
      flattenedDevDependencies: version.flattenedDevDependencies.clone(),
      packageDependencies: clone(version.packageDependencies),
      devPackageDependencies: clone(version.devPackageDependencies),
      peerPackageDependencies: clone(version.peerPackageDependencies),
      compilerPackageDependencies: clone(version.compilerPackageDependencies),
      testerPackageDependencies: clone(version.testerPackageDependencies),
      files,
      dists,
      mainDistFile: version.mainDistFile,
      docs: version.docs,
      license: scopeMeta ? License.deserialize(scopeMeta.license) : undefined, // todo: make sure we have license in case of local scope
      // @ts-ignore
      specsResults: version.specsResults ? version.specsResults.map(res => SpecsResults.deserialize(res)) : null,
      log,
      customResolvedPaths: clone(version.customResolvedPaths),
      overrides: ComponentOverrides.loadFromScope(version.overrides),
      packageJsonChangedProps: clone(version.packageJsonChangedProps),
      deprecated: this.deprecated,
      scopesList: clone(this.scopesList),
      schema: version.schema,
      extensions
    });
    if (manipulateDirData) {
      consumerComponent.stripOriginallySharedDir(manipulateDirData);
      consumerComponent.addWrapperDir(manipulateDirData);
    }

    return consumerComponent;
  }

  refs(): Ref[] {
    return Object.values(this.versions);
  }

  replaceRef(oldRef: Ref, newRef: Ref) {
    const replace = (value, key) => {
      if (value === oldRef.hash) {
        // @ts-ignore
        this.versions[key] = newRef.hash;
      }
    };
    forEachObjIndexed(replace, this.versions);
  }

  validateBeforePersisting(componentStr: string): void {
    logger.silly(`validating component object: ${this.hash().hash} ${this.id()}`);
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

  /**
   * Clear data that is relevant only for the local scope and should not be moved to the remote scope
   */
  clearStateData() {
    this.local = false; // backward compatibility for components created before 0.12.6
    this.state = {};
  }

  markVersionAsLocal(version: string) {
    if (!this.state.versions) this.state = { versions: {} };
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    if (!this.state.versions[version]) this.state.versions[version] = {};
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    this.state.versions[version].local = true;
  }

  getLocalVersions(): string[] {
    if (isEmpty(this.state) || isEmpty(this.state.versions)) return [];
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    return Object.keys(this.state.versions).filter(version => this.state.versions[version].local);
  }

  isLocallyChanged(): boolean {
    if (this.local) return true; // backward compatibility for components created before 0.12.6
    if (isEmpty(this.state) || isEmpty(this.state.versions)) return false;
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
      state: rawComponent.state,
      scopesList: rawComponent.remotes
    });
  }

  static from(props: ComponentProps): Component {
    return new Component(props);
  }

  static fromBitId(bitId: BitId): Component {
    if (bitId.box) throw new Error('component.fromBitId, bitId should not have the "box" property populated');
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    return new Component({
      name: bitId.name,
      scope: bitId.scope
    });
  }

  validate(): void {
    const message = `unable to save Component object "${this.id()}"`;
    if (!this.name) throw new GeneralError(`${message} the name is missing`);
    if (this.state && this.state.versions) {
      Object.keys(this.state.versions).forEach(version => {
        if (!this.versions[version]) {
          throw new ValidationError(`${message}, the version ${version} is marked as staged but is not available`);
        }
      });
    }
  }
}
