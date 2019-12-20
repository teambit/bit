import * as semver from 'semver';
import { equals, forEachObjIndexed, isEmpty, clone, difference } from 'ramda';
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
import versionParser, { isHash, isTag } from '../../version/version-parser';
import ComponentOverrides from '../../consumer/config/component-overrides';
import { makeEnvFromModel } from '../../extensions/env-factory';
import ShowDoctorError from '../../error/show-doctor-error';
import ValidationError from '../../error/validation-error';
import findDuplications from '../../utils/array/find-duplications';
import HeadNotFound from '../exceptions/head-not-found';
import ParentNotFound from '../exceptions/parent-not-found';
import { Lane, ModelComponent } from '.';
import LaneId from '../../lane-id/lane-id';

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

export type SnapModel = { head?: Ref };

export type DivergeResult = { snapsOnLocalOnly: Ref[]; snapsOnRemoteOnly: Ref[]; commonSnapBeforeDiverge: Ref | null };

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
  snaps?: SnapModel;
};

type VersionInfo = { ref: Ref; tag?: string; version?: Version; error?: Error };

const VERSION_ZERO = '0.0.0';

/**
 * we can't rename the class as ModelComponent because old components are already saved in the model
 * with 'Component' in their headers. see object-registrar.types()
 */
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
  snaps: SnapModel;
  laneHeadLocal?: Ref | null; // doesn't get saved in the scope, used to easier access the local snap head data
  laneHeadRemote?: Ref | null; // doesn't get saved in the scope, used to easier access the remote snap head data
  private divergeData;

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
    this.snaps = props.snaps || {};
  }

  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  get versionArray(): Ref[] {
    return Object.values(this.versions);
  }

  getRef(version: string): Ref | null {
    if (isHash(version)) {
      // if (!this.snaps.head) return null; // in case the component is on another lane, the head is empty!
      return new Ref(version);
      // @todo: should we check whether the ref really exists?
      // if (this.snaps.head.toString() === versionOrHash) return new Ref(versionOrHash);
      // throw new Error('todo: go through all parents and find the ref!');
    }
    return this.versions[version];
  }

  getHeadHash(): string | null {
    return this.snaps.head ? this.snaps.head.toString() : null;
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
    const allHashes = await this.getAllVersionHashes(repo, false);
    return allHashes.some(hash => hash.toString() === version);
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
    if (!this.scopesList.find(r => r.url === scopeListItem.url)) {
      this.scopesList.push(scopeListItem);
    }
  }

  /**
   * traversing the snaps history is not cheap, so we first try to avoid it and if not possible,
   * traverse by the local head, if it finds the remote head, no need to traverse by the remote
   * head. (it also means that we can do do fast-forward and no need for snap-merge).
   */
  async _loadDivergeData(repo: Repository, throws = true): Promise<DivergeResult> {
    const remoteHead = this.laneHeadRemote;
    const localHead = this.laneHeadLocal || this.snaps.head;
    const emptyResults = {
      snapsOnRemoteOnly: [],
      snapsOnLocalOnly: [],
      commonSnapBeforeDiverge: null
    };
    if (!remoteHead) {
      if (localHead) {
        const allVersions = await this.getAllVersionsInfo({ repo });
        const allLocalHashes = allVersions.map(v => v.ref);
        return {
          snapsOnRemoteOnly: [],
          snapsOnLocalOnly: allLocalHashes,
          commonSnapBeforeDiverge: null
        };
      }
      return emptyResults;
    }
    if (!localHead) {
      // @todo: this is happening when there a remote head and no local head, not sure this state
      // is even possible, maybe it is when fetching a remote before merging locally?
      return emptyResults;
    }

    if (remoteHead.isEqual(localHead)) {
      // no diverge they're the same
      return emptyResults;
    }

    const snapsOnLocal: Ref[] = [];
    const snapsOnRemote: Ref[] = [];
    let remoteHeadExistsLocally = false;
    let localHeadExistsRemotely = false;
    let commonSnapBeforeDiverge: Ref;
    const addParentsRecursively = async (version: Version, snaps: Ref[], isLocal: boolean) => {
      if (isLocal && version.hash().isEqual(remoteHead)) {
        remoteHeadExistsLocally = true;
        return;
      }
      if (!isLocal && version.hash().isEqual(localHead)) {
        localHeadExistsRemotely = true;
        return;
      }
      if (!isLocal && !commonSnapBeforeDiverge) {
        const snapExistLocally = snapsOnLocal.find(snap => snap.isEqual(version.hash()));
        if (snapExistLocally) commonSnapBeforeDiverge = snapExistLocally;
      }
      snaps.push(version.hash());
      await Promise.all(
        version.parents.map(async parent => {
          const parentVersion = (await parent.load(repo)) as Version;
          if (parentVersion) {
            await addParentsRecursively(parentVersion, snaps, isLocal);
          } else if (throws) {
            throw new ParentNotFound(this.id(), version.hash().toString(), parent.toString());
          }
        })
      );
    };
    const localVersion = (await repo.load(localHead)) as Version;
    await addParentsRecursively(localVersion, snapsOnLocal, true);
    if (remoteHeadExistsLocally)
      return { snapsOnRemoteOnly: [], snapsOnLocalOnly: snapsOnLocal, commonSnapBeforeDiverge: remoteHead };
    const remoteVersion = (await repo.load(remoteHead)) as Version;
    await addParentsRecursively(remoteVersion, snapsOnRemote, false);
    if (localHeadExistsRemotely)
      return { snapsOnRemoteOnly: snapsOnRemote, snapsOnLocalOnly: [], commonSnapBeforeDiverge: localHead };
    // @ts-ignore
    if (!commonSnapBeforeDiverge)
      throw new Error(
        `fatal: local and remote of ${this.id()} could not possibly diverged as they don't have any snap in common`
      );
    return {
      snapsOnRemoteOnly: difference(snapsOnRemote, snapsOnLocal),
      snapsOnLocalOnly: difference(snapsOnLocal, snapsOnRemote),
      commonSnapBeforeDiverge
    };
  }

  async setDivergeData(repo: Repository, throws = true): Promise<void> {
    if (!this.divergeData) {
      this.divergeData = await this._loadDivergeData(repo, throws);
    }
    return this.divergeData;
  }

  getDivergeData(): DivergeResult {
    if (!this.divergeData)
      throw new Error(`getDivergeData() expects divergeData to be populate, please use this.setDivergeData()`);
    return this.divergeData;
  }

  /**
   * when a local and remote history have diverged, a true merge is needed.
   * when a remote is ahead of the local, but local has no new commits, a fast-forward merge is possible.
   * when a local is ahead of the remote, no merge is needed.
   */
  isTrueMergePending(): boolean {
    const divergeData = this.getDivergeData();
    return Boolean(divergeData.snapsOnLocalOnly.length && divergeData.snapsOnRemoteOnly.length);
  }

  isLocalAhead(): boolean {
    const divergeData = this.getDivergeData();
    return Boolean(divergeData.snapsOnLocalOnly.length);
  }

  isRemoteAhead(): boolean {
    const divergeData = this.getDivergeData();
    return Boolean(divergeData.snapsOnRemoteOnly.length);
  }

  async populateLocalAndRemoteHeads(
    repo: Repository,
    laneId: LaneId,
    lane: Lane | null,
    remoteLaneId = laneId,
    remote = this.scope
  ) {
    if (lane) {
      this.laneHeadLocal = lane.getComponentHead(this.toBitId());
    }
    if (remote) {
      // otherwise, it was never exported, so no remote head
      this.laneHeadRemote = await repo.remoteLanes.getRef(remote, remoteLaneId, this.name);
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

  isEmpty() {
    return empty(this.versions) && !this.snaps.head;
  }

  latest(): string {
    if (this.isEmpty()) return VERSION_ZERO;
    if (this.snaps.head) {
      const version = this.getTagOfRefIfExists(this.snaps.head);
      return version || this.snaps.head.toString();
    }
    return semver.maxSatisfying(this.listVersions(), '*');
  }

  latestOnLane(): string {
    if (this.isEmpty()) return VERSION_ZERO;
    const head = this.laneHeadLocal || this.snaps.head;
    if (head) {
      return this.getTagOfRefIfExists(head) || head.toString();
    }
    return semver.maxSatisfying(this.listVersions(), '*');
  }

  /**
   * a user can be checked out to a lane, in which case, `this.laneHeadLocal` and `this.laneHeadRemote`
   * may be populated.
   * `this.snaps.head` may not be populated, e.g. when a component was created on
   * this lane and never got snapped on master.
   * it's impossible that `this.snaps.head.isEqual(this.laneHeadLocal)`, because when snapping it's either
   * on master, which goes to this.snaps.head OR on a lane, which goes to this.laneHeadLocal.
   */
  async latestIncludeRemote(repo: Repository): Promise<string> {
    const latestLocally = this.latestOnLane();
    const remoteHead = this.laneHeadRemote;
    if (!remoteHead) return latestLocally;
    if (!this.laneHeadLocal && !this.snaps.head) {
      return remoteHead.toString(); // user never merged the remote version, so remote is the latest
    }
    // either a user is on master or a lane, check whether the remote is ahead of the local
    const allVersions = await this.getAllVersionsInfo({ repo });
    const allLocalHashes = allVersions.map(v => v.ref);
    const isRemoteHeadExistsLocally = allLocalHashes.find(localHash => localHash.isEqual(remoteHead));
    if (isRemoteHeadExistsLocally) return latestLocally; // remote is behind
    return remoteHead.toString(); // remote is ahead
  }

  latestVersion(): string {
    if (empty(this.versions)) return VERSION_ZERO;
    return semver.maxSatisfying(this.listVersions(), '*');
  }

  // @todo: make it readable, it's a mess
  isLatestGreaterThan(version: string | null | undefined): boolean {
    if (!version) throw TypeError('isLatestGreaterThan expect to get a Version');
    const latest = this.latestOnLane();
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

  async collectLogs(
    repo: Repository
  ): Promise<{ [key: string]: { message: string; date: string; hash: string } | null | undefined }> {
    const versionsInfo = await this.getAllVersionsInfo({ repo, throws: false });
    return versionsInfo.reduce((acc, current: VersionInfo) => {
      const log = current.version ? current.version.log : { message: '<no-data-available>' };
      acc[current.tag || current.ref.toString()] = log;
      return acc;
    }, {});
  }

  collectVersions(repo: Repository): Promise<ConsumerComponent[]> {
    return Promise.all(
      this.listVersions().map(versionNum => {
        // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
        return this.toConsumerComponent(versionNum, this.scope, repo);
      })
    );
  }

  getTagOfRefIfExists(ref: Ref): string | undefined {
    return Object.keys(this.versions).find(versionRef => this.versions[versionRef].isEqual(ref));
  }

  /**
   * if versionObjects passed, use it instead of loading from the repo.
   */
  /* eslint-disable no-dupe-class-members */
  async getAllVersionsInfo({ repo, throws }: { repo?: Repository; throws?: boolean }): Promise<VersionInfo[]>;
  async getAllVersionsInfo({
    throws,
    versionObjects
  }: {
    throws?: boolean;
    versionObjects?: Version[];
  }): Promise<VersionInfo[]>;
  async getAllVersionsInfo({
    repo,
    throws = true,
    versionObjects
  }: {
    repo?: Repository;
    throws?: boolean;
    versionObjects?: Version[];
  }): Promise<VersionInfo[]> {
    /* eslint-enable no-dupe-class-members */
    const results: VersionInfo[] = [];
    const getVersionObj = async (ref: Ref): Promise<Version | undefined> => {
      if (versionObjects) return versionObjects.find(v => v.hash().isEqual(ref));
      if (repo) return (await ref.load(repo)) as Version;
      throw new TypeError('getAllVersionsInfo expect to get either repo or versionObjects');
    };
    const laneHead = this.laneHeadLocal || this.snaps.head;
    if (laneHead) {
      const headInfo: VersionInfo = { ref: laneHead, tag: this.getTagOfRefIfExists(laneHead) };
      const head = await getVersionObj(laneHead);
      if (head) {
        headInfo.version = head;
      } else {
        headInfo.error = new HeadNotFound(this.id(), laneHead.toString());
        if (throws) throw headInfo.error;
      }
      results.push(headInfo);

      const addParentsRecursively = async (version: Version) => {
        await Promise.all(
          version.parents.map(async parent => {
            const parentVersion = await getVersionObj(parent);
            const versionInfo: VersionInfo = { ref: parent, tag: this.getTagOfRefIfExists(parent) };
            if (parentVersion) {
              versionInfo.version = parentVersion;
              await addParentsRecursively(parentVersion);
            } else {
              versionInfo.error = versionInfo.tag
                ? new VersionNotFound(versionInfo.tag)
                : new ParentNotFound(this.id(), version.hash().toString(), parent.toString());
              if (throws) throw versionInfo.error;
            }
            results.push(versionInfo);
          })
        );
      };
      if (head) await addParentsRecursively(head);
    }
    // backward compatibility.
    // components created before v15, might not have snaps.head.
    // even if they do have snaps.head (as a result of tag/snap after v15), they
    // have old versions without parents and new versions with parents
    await Promise.all(
      Object.keys(this.versions).map(async version => {
        if (!results.find(r => r.tag === version)) {
          const ref = this.versions[version];
          const versionObj = await getVersionObj(ref);
          const versionInfo: VersionInfo = { ref, tag: version };
          if (versionObj) versionInfo.version = versionObj;
          else {
            versionInfo.error = new VersionNotFound(version);
            if (throws) throw versionInfo.error;
          }
          results.push(versionInfo);
        }
      })
    );

    return results;
  }

  async getAllVersionsObjects(repo: Repository, throws = true): Promise<Version[]> {
    const allVersionsInfo = await this.getAllVersionsInfo({ repo, throws });
    return allVersionsInfo.map(a => a.version).filter(a => a) as Version[];
  }

  async getAllVersionHashesByVersionsObjects(versionObjects: Version[], throws = true): Promise<Ref[]> {
    const allVersionsInfo = await this.getAllVersionsInfo({ throws, versionObjects });
    return allVersionsInfo.map(v => v.ref).filter(ref => ref) as Ref[];
  }

  async getAllVersionHashes(repo: Repository, throws = true): Promise<Ref[]> {
    const allVersionsInfo = await this.getAllVersionsInfo({ repo, throws });
    return allVersionsInfo.map(v => v.ref).filter(ref => ref) as Ref[];
  }

  switchHashesWithTagsIfExist(refs: Ref[]): string[] {
    return refs.map(ref => this.getTagOfRefIfExists(ref) || ref.toString());
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
    if (this.snaps.head && !this.hasTag(versionToAdd)) {
      // if this tag exists, the same version was added before with a different hash.
      // adding the current head into the parent will result in a non-exist hash in the parent.
      version.addAsOnlyParent(this.snaps.head);
    }
    this.snaps.head = version.hash();
    if (isTag(versionToAdd)) {
      this.versions[versionToAdd] = version.hash();
    }
    this.markVersionAsLocal(versionToAdd);
    return versionToAdd;
  }

  version(releaseType: semver.ReleaseType = DEFAULT_BIT_RELEASE_TYPE) {
    const latest = this.latestVersion();
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

  toBitIdWithLatestVersionAllowNull(): BitId {
    const id = this.toBitIdWithLatestVersion();
    return id.version === VERSION_ZERO ? id.changeVersion(null) : id;
  }

  toObject() {
    function versions(vers: Versions) {
      const obj = {};
      forEach(vers, (ref, version) => {
        obj[version] = ref.toString();
      });
      return obj;
    }

    function snaps(thisSnaps: SnapModel) {
      const head = thisSnaps.head ? thisSnaps.head.toString() : null;
      if (!head) return null;
      return { head };
    }

    const componentObject = {
      name: this.name,
      scope: this.scope,
      versions: versions(this.versions),
      lang: this.lang,
      deprecated: this.deprecated,
      bindingPrefix: this.bindingPrefix,
      remotes: this.scopesList,
      snaps: snaps(this.snaps)
    };
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    if (this.local) componentObject.local = this.local;
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    if (!isEmpty(this.state)) componentObject.state = this.state;

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
    const objectRef = this.getRef(version);
    if (!objectRef) throw new Error(`removeVersion failed finding version ${version}`);
    if (objectRef) delete this.versions[version];
    if (this.state.versions && this.state.versions[version]) delete this.state.versions[version];
    return objectRef || Ref.from(version);
  }

  toComponentVersion(versionStr: string): ComponentVersion {
    const versionParsed = versionParser(versionStr);
    const versionNum = versionParsed.latest ? this.latest() : versionParsed.resolve(this.listVersions());

    if (isTag(versionNum) && !this.hasTag(versionNum)) {
      throw new ShowDoctorError(
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
      mainDistFile: version.mainDistFile,
      docs: version.docs,
      license: scopeMeta ? License.deserialize(scopeMeta.license) : null, // todo: make sure we have license in case of local scope
      // @ts-ignore
      specsResults: version.specsResults ? version.specsResults.map(res => SpecsResults.deserialize(res)) : null,
      log,
      customResolvedPaths: clone(version.customResolvedPaths),
      overrides: ComponentOverrides.loadFromScope(version.overrides),
      packageJsonChangedProps: clone(version.packageJsonChangedProps),
      deprecated: this.deprecated,
      scopesList: clone(this.scopesList),
      extensions: clone(version.extensions)
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
    if (this.snaps.head) versions.push(this.snaps.head);
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

  getLocalVersions(): string[] {
    if (isEmpty(this.state) || isEmpty(this.state.versions)) return [];
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    return Object.keys(this.state.versions).filter(version => this.state.versions[version].local);
  }

  getLocalTagsOrHashes(): string[] {
    const localVersions = this.getLocalVersions();
    if (!this.divergeData) return localVersions;
    const divergeData = this.getDivergeData();
    const localHashes = divergeData.snapsOnLocalOnly;
    if (!localHashes.length) return localVersions;
    if (!divergeData.snapsOnRemoteOnly.length && this.scope) return localVersions; // backward compatibility of components tagged before v15
    return this.switchHashesWithTagsIfExist(localHashes).reverse(); // reverse to get the older first
  }

  isLocallyChanged(): boolean {
    if (this.local) return true; // backward compatibility for components created before 0.12.6
    const localVersions = this.getLocalVersions();
    if (localVersions.length) return true;
    if (this.laneHeadLocal && !this.laneHeadRemote) return true;
    // todo: travel the parents to check whether local changes were done.
    return false;
  }

  async isLocallyChangedOnLane(repo: Repository, lane?: Lane | null): Promise<boolean> {
    if (!lane) return this.isLocallyChanged();
    await this.populateLocalAndRemoteHeads(repo, lane.toLaneId(), lane);
    await this.setDivergeData(repo);
    return this.isLocalAhead();
  }

  static parse(contents: string): Component {
    function snaps(thisSnaps) {
      if (!thisSnaps) return null;
      thisSnaps.head = new Ref(thisSnaps.head);
      return thisSnaps;
    }
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
      scopesList: rawComponent.remotes,
      snaps: snaps(rawComponent.snaps)
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
        if (isTag(version) && !this.hasTag(version)) {
          throw new ValidationError(`${message}, the version ${version} is marked as staged but is not available`);
        }
      });
    }
    const hashDuplications = findDuplications(this.versionArray.map(v => v.toString()));
    if (hashDuplications.length) {
      throw new ValidationError(`${message}, the following hash(es) are duplicated ${hashDuplications.join(', ')}`);
    }
  }
}
