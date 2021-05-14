import { clone, equals, forEachObjIndexed, isEmpty } from 'ramda';
import * as semver from 'semver';
import { versionParser, isHash, isTag } from '@teambit/component-version';
import { v4 } from 'uuid';
import { LegacyComponentLog } from '@teambit/legacy-component-log';
import { BitId } from '../../bit-id';
import {
  COMPILER_ENV_TYPE,
  DEFAULT_BINDINGS_PREFIX,
  DEFAULT_BIT_RELEASE_TYPE,
  DEFAULT_BIT_VERSION,
  DEFAULT_LANE,
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

type Versions = { [version: string]: Ref };
export type ScopeListItem = { url: string; name: string; date: string };

export type ComponentLog = LegacyComponentLog;

export type ComponentProps = {
  scope: string | null | undefined;
  name: string;
  versions?: Versions;
  orphanedVersions?: Versions;
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
  orphanedVersions: Versions;
  lang: string;
  deprecated: boolean;
  bindingPrefix: string;
  /**
   * @deprecated since 0.12.6 (long long ago :) probably can be removed)
   */
  local: boolean | null | undefined;
  state: State;
  scopesList: ScopeListItem[];
  head?: Ref;
  remoteHead?: Ref | null; // doesn't get saved in the scope, used to easier access the remote master head
  /**
   * doesn't get saved in the scope, used to easier access the local snap head data
   * when checked out to a lane, this prop is either Ref or null. otherwise (when on master), this
   * prop is undefined.
   */
  laneHeadLocal?: Ref | null;
  laneHeadRemote?: Ref | null; // doesn't get saved in the scope, used to easier access the remote snap head data
  private divergeData?: DivergeData;

  constructor(props: ComponentProps) {
    super();
    if (!props.name) throw new TypeError('Model Component constructor expects to get a name parameter');
    this.scope = props.scope || null;
    this.name = props.name;
    this.versions = props.versions || {};
    this.orphanedVersions = props.orphanedVersions || {};
    this.lang = props.lang || DEFAULT_LANGUAGE;
    this.deprecated = props.deprecated || false;
    this.bindingPrefix = props.bindingPrefix || DEFAULT_BINDINGS_PREFIX;
    this.local = props.local;
    this.state = props.state || {};
    this.scopesList = props.scopesList || [];
    this.head = props.head;
  }

  get versionArray(): Ref[] {
    return Object.values(this.versions);
  }

  setVersion(tag: string, ref: Ref) {
    this.versions[tag] = ref;
    delete this.orphanedVersions[tag]; // just in case it's there.
  }

  setOrphanedVersion(tag: string, ref: Ref) {
    if (this.versions[tag]) {
      throw new Error(
        `unable to save orphanedVersion "${tag}" for "${this.id()}" because this tag is already part of the versions prop`
      );
    }
    this.orphanedVersions[tag] = ref;
  }

  getRef(version: string): Ref | null {
    if (isHash(version)) {
      return new Ref(version);
    }
    return this.versionsIncludeOrphaned[version];
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

  listVersionsIncludeOrphaned(sort?: 'ASC' | 'DESC'): string[] {
    const versions = Object.keys(this.versionsIncludeOrphaned);
    if (!sort) return versions;
    if (sort === 'ASC') {
      return versions.sort(semver.compare);
    }

    return versions.sort(semver.compare).reverse();
  }

  async hasVersion(version: string, repo: Repository, includeOrphaned = true): Promise<boolean> {
    if (isTag(version)) {
      return includeOrphaned ? this.hasTagIncludeOrphaned(version) : this.hasTag(version);
    }
    const allHashes = await getAllVersionHashes(this, repo, false);
    return allHashes.some((hash) => hash.toString() === version);
  }

  hasTag(version: string): boolean {
    return Boolean(this.versions[version]);
  }

  get versionsIncludeOrphaned(): Versions {
    return { ...this.orphanedVersions, ...this.versions };
  }

  hasTagIncludeOrphaned(version: string): boolean {
    return Boolean(this.versions[version] || this.orphanedVersions[version]);
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
      // we need also the remote head of master, otherwise, the diverge-data assumes all versions are local
      this.remoteHead = await repo.remoteLanes.getRef(RemoteLaneId.from(DEFAULT_LANE, remoteScopeName), this.toBitId());
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
        ...log, // @ts-ignore
        username: log?.username || 'unknown',
        // @ts-ignore
        email: log?.email || 'unknown',
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

  getTagOfRefIfExists(ref: Ref, allTags = this.versionsIncludeOrphaned): string | undefined {
    return Object.keys(allTags).find((versionRef) => allTags[versionRef].isEqual(ref));
  }

  switchHashesWithTagsIfExist(refs: Ref[]): string[] {
    // cache the this.versionsIncludeOrphaned results into "allTags", looks strange but it improved
    // the performance on bit-bin with 188 components during source.merge in 4 seconds.
    const allTags = this.versionsIncludeOrphaned;
    return refs.map((ref) => this.getTagOfRefIfExists(ref, allTags) || ref.toString());
  }

  /**
   * if exactVersion is defined, add exact version instead of using the semver mechanism
   */
  getVersionToAdd(
    releaseType: semver.ReleaseType = DEFAULT_BIT_RELEASE_TYPE,
    exactVersion?: string | null,
    incrementBy?: number
  ): string {
    if (exactVersion && this.versions[exactVersion]) {
      throw new VersionAlreadyExists(exactVersion, this.id());
    }
    return exactVersion || this.version(releaseType, incrementBy);
  }

  isEqual(component: Component, considerOrphanedVersions = true): boolean {
    if ((this.hasHead() && !component.hasHead()) || (!this.hasHead() && component.hasHead())) {
      return false; // only one of them has head
    }
    if (this.head && component.head && !this.head.isEqual(component.head)) {
      return false; // the head is not equal.
    }
    // the head is equal or they both don't have head. check the versions
    if (this.versionArray.length !== component.versionArray.length) {
      return false;
    }
    const hasSameVersions = Object.keys(this.versions).every(
      (tag) => component.versions[tag] && component.versions[tag].isEqual(this.versions[tag])
    );
    if (considerOrphanedVersions) {
      if (Object.keys(this.orphanedVersions).length !== Object.keys(component.orphanedVersions).length) {
        return false;
      }
      const hasSameOrphanedVersions = Object.keys(this.orphanedVersions).every(
        (tag) => component.orphanedVersions[tag] && component.orphanedVersions[tag].isEqual(this.orphanedVersions[tag])
      );
      if (!hasSameOrphanedVersions) {
        return false;
      }
    }

    return hasSameVersions;
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
      this.setVersion(versionToAdd, version.hash());
    }
    this.markVersionAsLocal(versionToAdd);
    return versionToAdd;
  }

  version(releaseType: semver.ReleaseType = DEFAULT_BIT_RELEASE_TYPE, incrementBy = 1): string {
    const latest = this.latestVersion();
    if (!latest) return DEFAULT_BIT_VERSION;
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    let result = semver.inc(latest, releaseType)!;
    if (incrementBy === 1) return result;
    for (let i = 1; i < incrementBy; i += 1) {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      result = semver.inc(result, releaseType)!;
    }
    return result;
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
    // @ts-ignore
    if (!isEmpty(this.orphanedVersions)) componentObject.orphanedVersions = versions(this.orphanedVersions);
    const headStr = this.getHeadStr();
    // @ts-ignore
    if (headStr) componentObject.head = headStr;

    return componentObject;
  }

  async loadVersion(versionStr: string, repository: Repository, throws = true): Promise<Version> {
    const versionRef = this.getRef(versionStr);
    if (!versionRef) throw new VersionNotFound(versionStr, this.id());
    const version = await versionRef.load(repository);
    if (!version && throws) throw new VersionNotFound(versionStr, this.id(), true);
    return version as Version;
  }

  loadVersionSync(version: string, repository: Repository, throws = true): Version {
    const versionRef = this.getRef(version);
    if (!versionRef) throw new VersionNotFound(version, this.id());
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
    try {
      return await repo.loadManyRaw(refs);
    } catch (err) {
      if (err.code === 'ENOENT') {
        throw new Error(`unable to find an object file "${err.path}"
for a component "${this.id()}", versions: ${versions.join(', ')}`);
      }
      throw err;
    }
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

  toComponentVersion(versionStr: string | undefined): ComponentVersion {
    const versionParsed = versionParser(versionStr);
    const versionNum = versionParsed.latest ? this.latest() : versionParsed.resolve(this.listVersionsIncludeOrphaned());
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    if (versionNum === VERSION_ZERO) {
      throw new Error(`the component ${this.id()} has no versions and the head is empty.
this is probably a component from another lane which should not be loaded in this lane.
make sure to call "getAllIdsAvailableOnLane" and not "getAllBitIdsFromAllLanes"`);
    }
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    if (isTag(versionNum) && !this.hasTagIncludeOrphaned(versionNum!)) {
      throw new ShowDoctorError(
        `the version ${versionNum} of "${this.id()}" does not exist in ${this.listVersionsIncludeOrphaned().join(
          '\n'
        )}, versions array.`
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
      if (!content)
        throw new ShowDoctorError(
          `failed loading file ${file.relativePath} from the model of ${this.id()}@${versionStr}`
        );
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
      // @ts-ignore
      compiler,
      // @ts-ignore
      tester,
      dependencies: version.dependencies.getClone(),
      devDependencies: version.devDependencies.getClone(),
      flattenedDependencies: version.flattenedDependencies.clone(),
      packageDependencies: clone(version.packageDependencies),
      devPackageDependencies: clone(version.devPackageDependencies),
      peerPackageDependencies: clone(version.peerPackageDependencies),
      compilerPackageDependencies: clone(version.compilerPackageDependencies),
      testerPackageDependencies: clone(version.testerPackageDependencies),
      // @ts-ignore
      files,
      // @ts-ignore
      dists,
      mainDistFile: version.mainDistFile,
      docs: version.docs,
      // @ts-ignore
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
      buildStatus: version.buildStatus,
    });
    if (manipulateDirData) {
      consumerComponent.stripOriginallySharedDir(manipulateDirData);
      consumerComponent.addWrapperDir(manipulateDirData);
    }

    return consumerComponent;
  }

  // @todo: make sure it doesn't have the same ref twice, once as a version and once as a head
  refs(): Ref[] {
    const versions = Object.values(this.versionsIncludeOrphaned);
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
    logger.trace(`validating component object: ${this.hash().hash} ${this.id()}`);
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

  hasLocalTag(tag: string): boolean {
    const localVersions = this.getLocalVersions();
    return localVersions.includes(tag);
  }

  hasLocalVersion(version: string): boolean {
    const localVersions = this.getLocalTagsOrHashes();
    return localVersions.includes(version);
  }

  getLocalTagsOrHashes(): string[] {
    const localVersions = this.getLocalVersions();
    if (!this.divergeData) return localVersions;
    const divergeData = this.getDivergeData();
    const localHashes = divergeData.snapsOnLocalOnly;
    if (!localHashes.length) return localVersions;
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
    // @todo: why this is needed? on master, the localVersion must be populated if changed locally
    // regardless the laneHeadLocal/laneHeadRemote.
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
      orphanedVersions: mapObject(rawComponent.orphanedVersions || {}, (val) => Ref.from(val)),
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
    Object.keys(this.orphanedVersions).forEach((version) => {
      if (this.versions[version]) {
        throw new ValidationError(
          `${message}, the version "${version}" exists in orphanedVersions but it exits also in "versions" prop`
        );
      }
    });
  }
}
