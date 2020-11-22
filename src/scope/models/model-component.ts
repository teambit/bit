import { clone, equals, forEachObjIndexed, isEmpty } from 'ramda';
import * as semver from 'semver';
import { v4 } from 'uuid';
import BitId from '../../bit-id/bit-id';
import {
  COMPILER_ENV_TYPE,
  DEFAULT_BINDINGS_PREFIX,
  DEFAULT_BIT_RELEASE_TYPE,
  DEFAULT_BIT_VERSION,
  DEFAULT_LANGUAGE,
  TESTER_ENV_TYPE,
} from '../../constants';
import ConsumerComponent from '../../consumer/component';
import { ManipulateDirItem } from '../../consumer/component-ops/manipulate-dir';
import { Dist, License, SourceFile } from '../../consumer/component/sources';
import ComponentOverrides from '../../consumer/config/component-overrides';
import SpecsResults from '../../consumer/specs-results';
import GeneralError from '../../error/general-error';
import ShowDoctorError from '../../error/show-doctor-error';
import ValidationError from '../../error/validation-error';
import LaneId, { RemoteLaneId } from '../../lane-id/lane-id';
import { makeEnvFromModel } from '../../legacy-extensions/env-factory';
import logger from '../../logger/logger';
import { empty, filterObject, forEach, getStringifyArgs, mapObject, sha1 } from '../../utils';
import findDuplications from '../../utils/array/find-duplications';
import versionParser, { isHash, isTag } from '../../version/version-parser';
import ComponentObjects from '../component-objects';
import { DivergeData } from '../component-ops/diverge-data';
import { getDivergeData } from '../component-ops/get-diverge-data';
import { getAllVersionHashes, getAllVersionsInfo } from '../component-ops/traverse-versions';
import ComponentVersion from '../component-version';
import { VersionAlreadyExists, VersionNotFound } from '../exceptions';
import { BitObject, Ref } from '../objects';
import Repository from '../objects/repository';
import { Lane } from '.';
import ScopeMeta from './scopeMeta';
import Source from './source';
import Version from './version';
import { getLatestVersion } from '../../utils/semver-helper';
import { ObjectItem } from '../objects/object-list';

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

export type ComponentLog = {
  message: string;
  username?: string;
  email?: string;
  date?: string;
  hash: string;
  tag?: string;
};

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
  head?: Ref;
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
  head?: Ref;
  remoteHead?: Ref | null; // doesn't get saved in the scope, used to easier access the remote master head
  laneHeadLocal?: Ref | null; // doesn't get saved in the scope, used to easier access the local snap head data
  laneHeadRemote?: Ref | null; // doesn't get saved in the scope, used to easier access the remote snap head data
  private divergeData?: DivergeData;

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
    this.head = props.head;
  }

  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  get versionArray(): Ref[] {
    return Object.values(this.versions);
  }

  getRef(version: string): Ref | null {
    if (isHash(version)) {
      return new Ref(version);
    }
    return this.versions[version];
  }

  getHeadStr(): string | null {
    return this.head ? this.head.toString() : null;
  }

  getHead(): Ref | undefined {
    return this.head;
  }

  hasHead() {
    return Boolean(this.head);
  }

  setHead(head: Ref | undefined) {
    this.head = head;
  }

  listVersions(sort?: 'ASC' | 'DESC'): string[] {
    const versions = Object.keys(this.versions);
    if (!sort) return versions;
    if (sort === 'ASC') {
      return versions.sort(semver.compare);
    }

    return versions.sort(semver.compare).reverse();
  }

  async hasVersion(version: string, repo: Repository): Promise<boolean> {
    if (isTag(version)) return this.hasTag(version);
    const allHashes = await getAllVersionHashes(this, repo, false);
    return allHashes.some((hash) => hash.toString() === version);
  }

  hasTag(version: string): boolean {
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
    if (!this.scopesList.find((r) => r.url === scopeListItem.url)) {
      this.scopesList.push(scopeListItem);
    }
  }

  async setDivergeData(repo: Repository, throws = true): Promise<void> {
    if (!this.divergeData) {
      const remoteHead = this.laneHeadRemote || this.remoteHead || null;
      this.divergeData = await getDivergeData(repo, this, remoteHead, throws);
    }
  }

  getDivergeData(): DivergeData {
    if (!this.divergeData)
      throw new Error(`getDivergeData() expects divergeData to be populate, please use this.setDivergeData()`);
    return this.divergeData;
  }

  async populateLocalAndRemoteHeads(
    repo: Repository,
    laneId: LaneId,
    lane: Lane | null,
    remoteLaneId = laneId,
    remoteScopeName = this.scope
  ) {
    // @todo: this doesn't take into account a case when local and remote have different names.
    this.setLaneHeadLocal(lane);
    if (remoteScopeName) {
      // otherwise, it was never exported, so no remote head
      this.laneHeadRemote = await repo.remoteLanes.getRef(
        RemoteLaneId.from(remoteLaneId.name, remoteScopeName),
        this.toBitId()
      );
    }
  }

  setLaneHeadLocal(lane: Lane | null) {
    if (lane) {
      this.laneHeadLocal = lane.getComponentHead(this.toBitId());
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
      (version) => thisComponentVersions[version].hash !== otherComponentVersions[version].hash
    );
  }

  isEmpty() {
    return empty(this.versions) && !this.hasHead();
  }

  latest(): string {
    if (this.isEmpty() && !this.laneHeadLocal) return VERSION_ZERO;
    const head = this.laneHeadLocal || this.getHead();
    if (head) {
      return this.getTagOfRefIfExists(head) || head.toString();
    }
    // backward compatibility. components created before v15 have master without head
    // @ts-ignore
    return semver.maxSatisfying(this.listVersions(), '*');
  }

  /**
   * a user can be checked out to a lane, in which case, `this.laneHeadLocal` and `this.laneHeadRemote`
   * may be populated.
   * `this.head` may not be populated, e.g. when a component was created on
   * this lane and never got snapped on master.
   * it's impossible that `this.head.isEqual(this.laneHeadLocal)`, because when snapping it's either
   * on master, which goes to this.head OR on a lane, which goes to this.laneHeadLocal.
   */
  async latestIncludeRemote(repo: Repository): Promise<string> {
    const latestLocally = this.latest();
    const remoteHead = this.laneHeadRemote;
    if (!remoteHead) return latestLocally;
    if (!this.laneHeadLocal && !this.hasHead()) {
      return remoteHead.toString(); // user never merged the remote version, so remote is the latest
    }
    // either a user is on master or a lane, check whether the remote is ahead of the local
    const allLocalHashes = await getAllVersionHashes(this, repo, false);
    const isRemoteHeadExistsLocally = allLocalHashes.find((localHash) => localHash.isEqual(remoteHead));
    if (isRemoteHeadExistsLocally) return latestLocally; // remote is behind
    return remoteHead.toString(); // remote is ahead
  }

  latestVersion(): string {
    if (empty(this.versions)) return VERSION_ZERO;
    return getLatestVersion(this.listVersions());
  }

  // @todo: make it readable, it's a mess
  isLatestGreaterThan(version: string | null | undefined): boolean {
    if (!version) throw TypeError('isLatestGreaterThan expect to get a Version');
    const latest = this.latest();
    if (this.isEmpty()) return false; // in case a snap was created on another lane
    if (isTag(latest) && isTag(version)) {
      return semver.gt(latest, version);
    }
    if (latest === version) return false;
    const latestRef = this.getRef(latest);
    if (!latestRef) throw new Error('isLatestGreaterThan, latestRef was not found');
    const latestHash = latestRef.toString();
    const versionRef = this.getRef(version);
    if (!versionRef) return true; // probably a child
    const versionHash = versionRef.toString();
    if (latestHash === versionHash) return false;
    return true;
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

  async collectLogs(repo: Repository): Promise<ComponentLog[]> {
    const versionsInfo = await getAllVersionsInfo({ modelComponent: this, repo, throws: false });
    return versionsInfo.map((versionInfo) => {
      const log = versionInfo.version ? versionInfo.version.log : { message: '<no-data-available>' };
      return {
        ...log,
        tag: versionInfo.tag,
        hash: versionInfo.ref.toString(),
      };
    });
  }

  collectVersions(repo: Repository): Promise<ConsumerComponent[]> {
    return Promise.all(
      this.listVersions().map((versionNum) => {
        // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
        return this.toConsumerComponent(versionNum, this.scope, repo);
      })
    );
  }

  getTagOfRefIfExists(ref: Ref): string | undefined {
    return Object.keys(this.versions).find((versionRef) => this.versions[versionRef].isEqual(ref));
  }

  switchHashesWithTagsIfExist(refs: Ref[]): string[] {
    return refs.map((ref) => this.getTagOfRefIfExists(ref) || ref.toString());
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

  getSnapToAdd() {
    return sha1(v4());
  }

  addVersion(version: Version, versionToAdd: string, lane: Lane | null, repo: Repository): string {
    if (lane) {
      if (isTag(versionToAdd)) {
        throw new GeneralError(
          'unable to tag when checked out to a lane, please switch to master, merge the lane and then tag again'
        );
      }
      const versionToAddRef = Ref.from(versionToAdd);
      const existingComponentInLane = lane.getComponentByName(this.toBitId());
      const currentHead = (existingComponentInLane && existingComponentInLane.head) || this.getHead();
      if (currentHead && !currentHead.isEqual(versionToAddRef)) {
        version.addAsOnlyParent(currentHead);
      }
      lane.addComponent({ id: this.toBitId(), head: versionToAddRef });
      repo.add(lane);
      this.laneHeadLocal = versionToAddRef;
      return versionToAdd;
    }
    // user on master
    const head = this.getHead();
    if (
      head &&
      head.toString() !== versionToAdd && // happens with auto-snap
      !this.hasTag(versionToAdd)
    ) {
      // happens with auto-tag
      // if this is a tag and this tag exists, the same version was added before with a different hash.
      // adding the current head into the parent will result in a non-exist hash in the parent.
      // if this is a hash and it's the same hash as the current head, adding it as a parent
      // results in a parent and a version has the same hash.
      // @todo: fix it in a more elegant way
      version.addAsOnlyParent(head);
    }
    if (!version.isLegacy) this.setHead(version.hash());
    if (isTag(versionToAdd)) {
      this.versions[versionToAdd] = version.hash();
    }
    this.markVersionAsLocal(versionToAdd);
    return versionToAdd;
  }

  version(releaseType: semver.ReleaseType = DEFAULT_BIT_RELEASE_TYPE): string {
    const latest = this.latestVersion();
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
      remotes: this.scopesList,
    };
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    if (this.local) componentObject.local = this.local;
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    if (!isEmpty(this.state)) componentObject.state = this.state;
    const headStr = this.getHeadStr();
    // @ts-ignore
    if (headStr) componentObject.head = headStr;

    return componentObject;
  }

  async loadVersion(version: string, repository: Repository): Promise<Version> {
    const versionRef = this.getRef(version);
    if (!versionRef) throw new VersionNotFound(version);
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    return versionRef.load(repository);
  }

  loadVersionSync(version: string, repository: Repository, throws = true): Version {
    const versionRef = this.getRef(version);
    if (!versionRef) throw new VersionNotFound(version);
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    return versionRef.loadSync(repository, throws);
  }

  async collectVersionsObjects(repo: Repository, versions: string[]): Promise<ObjectItem[]> {
    const collectRefs = async (): Promise<Ref[]> => {
      const refsCollection: Ref[] = [];
      const versionsRefs = versions.map((version) => this.getRef(version) as Ref);
      refsCollection.push(...versionsRefs);
      // @ts-ignore
      const versionsObjects: Version[] = await Promise.all(versionsRefs.map((versionRef) => versionRef.load(repo)));
      versionsObjects.forEach((versionObject) => {
        const refs = versionObject.refsWithOptions(false, true);
        refsCollection.push(...refs);
      });
      return refsCollection;
    };
    const refs = await collectRefs();
    return Promise.all(refs.map(async (ref) => ({ ref, buffer: await ref.loadRaw(repo) })));
  }

  async collectObjects(repo: Repository): Promise<ComponentObjects> {
    try {
      const [rawComponent, objects] = await Promise.all([this.asRaw(repo), this.collectRaw(repo)]);
      return new ComponentObjects(
        rawComponent,
        objects.map((o) => o.buffer)
      );
    } catch (err) {
      if (err.code === 'ENOENT') {
        throw new Error(
          `fatal: an object of "${this.id()}" was not found at ${err.path}\nplease try to re-import the component`
        );
      }
      throw err;
    }
  }

  /**
   * to delete a version from a component, don't call this method directly. Instead, use sources.removeVersion()
   */
  removeVersion(version: string): Ref {
    const objectRef = this.getRef(version);
    if (!objectRef) throw new Error(`removeVersion failed finding version ${version}`);
    if (objectRef) delete this.versions[version];
    if (this.state.versions && this.state.versions[version]) delete this.state.versions[version];
    return objectRef || Ref.from(version);
  }

  toComponentVersion(versionStr: string): ComponentVersion {
    const versionParsed = versionParser(versionStr);
    const versionNum = versionParsed.latest ? this.latest() : versionParsed.resolve(this.listVersions());
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    if (isTag(versionNum) && !this.hasTag(versionNum!)) {
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
    const loadFileInstance = (ClassName) => async (file) => {
      const loadP = file.file.load(repository);
      const content: Source = await loadP;
      if (!content) throw new ShowDoctorError(`failed loading file ${file.relativePath} from the model`);
      return new ClassName({ base: '.', path: file.relativePath, contents: content.contents, test: file.test });
    };
    const filesP = version.files ? Promise.all(version.files.map(loadFileInstance(SourceFile))) : null;
    const distsP = version.dists ? Promise.all(version.dists.map(loadFileInstance(Dist))) : null;
    // @todo: this is weird. why the scopeMeta would be taken from the current scope and not he component scope?
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
      testerP,
    ]);

    const extensions = version.extensions.clone();

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
      specsResults: version.specsResults ? version.specsResults.map((res) => SpecsResults.deserialize(res)) : null,
      log,
      customResolvedPaths: clone(version.customResolvedPaths),
      overrides: ComponentOverrides.loadFromScope(version.overrides),
      packageJsonChangedProps: clone(version.packageJsonChangedProps),
      deprecated: this.deprecated,
      scopesList: clone(this.scopesList),
      schema: version.schema,
      extensions,
    });
    if (manipulateDirData) {
      consumerComponent.stripOriginallySharedDir(manipulateDirData);
      consumerComponent.addWrapperDir(manipulateDirData);
    }

    return consumerComponent;
  }

  // @todo: make sure it doesn't have the same ref twice, once as a version and once as a head
  refs(): Ref[] {
    const versions = Object.values(this.versions);
    if (this.head) versions.push(this.head);
    return versions;
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
    if (!this.state.versions[version]) this.state.versions[version] = {};
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    this.state.versions[version].local = true;
  }

  /**
   * local versions that are not exported. to get also local snaps, use `getLocalTagsOrHashes()`.
   */
  getLocalVersions(): string[] {
    if (isEmpty(this.state) || isEmpty(this.state.versions)) return [];
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    return Object.keys(this.state.versions).filter((version) => this.state.versions[version].local);
  }

  getLocalTagsOrHashes(): string[] {
    const localVersions = this.getLocalVersions();
    if (!this.divergeData) return localVersions;
    const divergeData = this.getDivergeData();
    const localHashes = divergeData.snapsOnLocalOnly;
    if (!localHashes.length) return localVersions;
    // @todo: this doesn't make sense when creating a new lane locally.
    // the laneHeadRemote is not set. it needs to be compare to the head
    if (!this.laneHeadRemote && this.scope) return localVersions; // backward compatibility of components tagged before v15
    return this.switchHashesWithTagsIfExist(localHashes).reverse(); // reverse to get the older first
  }

  async isLocallyChanged(lane?: Lane | null, repo?: Repository): Promise<boolean> {
    if (lane) {
      if (!repo) throw new Error('isLocallyChanged expects to get repo when lane was provided');
      await this.populateLocalAndRemoteHeads(repo, lane.toLaneId(), lane);
      await this.setDivergeData(repo);
      return this.getDivergeData().isLocalAhead();
    }
    // when on master, no need to traverse the parents because local snaps/tags are saved in the
    // component object and retrieved by `this.getLocalVersions()`.
    if (this.local) return true; // backward compatibility for components created before 0.12.6
    const localVersions = this.getLocalVersions();
    if (localVersions.length) return true;
    if (this.laneHeadLocal && !this.laneHeadRemote) return true;
    return false;
  }

  static parse(contents: string): Component {
    const rawComponent = JSON.parse(contents);
    return Component.from({
      name: rawComponent.box ? `${rawComponent.box}/${rawComponent.name}` : rawComponent.name,
      scope: rawComponent.scope,
      versions: mapObject(rawComponent.versions, (val) => Ref.from(val)),
      lang: rawComponent.lang,
      deprecated: rawComponent.deprecated,
      bindingPrefix: rawComponent.bindingPrefix,
      local: rawComponent.local,
      state: rawComponent.state,
      scopesList: rawComponent.remotes,
      head: rawComponent.head ? Ref.from(rawComponent.head) : undefined,
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
      scope: bitId.scope,
    });
  }

  validate(): void {
    const message = `unable to save Component object "${this.id()}"`;
    if (!this.name) throw new GeneralError(`${message} the name is missing`);
    if (this.state && this.state.versions) {
      Object.keys(this.state.versions).forEach((version) => {
        if (isTag(version) && !this.hasTag(version)) {
          throw new ValidationError(`${message}, the version ${version} is marked as staged but is not available`);
        }
      });
    }
    const hashDuplications = findDuplications(this.versionArray.map((v) => v.toString()));
    if (hashDuplications.length) {
      throw new ValidationError(`${message}, the following hash(es) are duplicated ${hashDuplications.join(', ')}`);
    }
  }
}
