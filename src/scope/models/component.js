/** @flow */
import semver from 'semver';
import uniqBy from 'lodash.uniqby';
import { equals, zip, fromPairs, keys, map, prop, forEachObjIndexed, isEmpty, clone } from 'ramda';
import { Ref, BitObject } from '../objects';
import { ScopeMeta } from '../models';
import { VersionNotFound, VersionAlreadyExists } from '../exceptions';
import { forEach, empty, mapObject, values, diff, filterObject, getStringifyArgs } from '../../utils';
import Version from './version';
import {
  DEFAULT_BOX_NAME,
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
import { BitIds } from '../../bit-id';

type State = {
  versions?: {
    [string]: {
      local?: boolean // whether a component was changed locally
    }
  }
};

export type ComponentProps = {
  scope?: string,
  box?: string,
  name: string,
  versions?: { [string]: Ref },
  lang?: string,
  deprecated: boolean,
  bindingPrefix?: string,
  /**
   * @deprecated since 0.12.6. It's currently stored in 'state' attribute
   */
  local?: boolean, // get deleted after export
  state?: State // get deleted after export
};

export default class Component extends BitObject {
  scope: string;
  name: string;
  box: string;
  versions: { [string]: Ref };
  lang: string;
  deprecated: boolean;
  bindingPrefix: string;
  local: boolean;
  state: State;

  constructor(props: ComponentProps) {
    super();
    this.scope = props.scope || null;
    this.name = props.name;
    this.box = props.box || DEFAULT_BOX_NAME;
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

  compatibleWith(component: Component) {
    const differnece = diff(Object.keys(this.versions), Object.keys(component.versions));

    const comparableObject = filterObject(this.versions, (val, key) => !differnece.includes(key));
    return equals(component.versions, comparableObject);
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

  collectVersions(repo: Repository): Promise<ConsumerComponent> {
    return Promise.all(
      this.listVersions().map((versionNum) => {
        return this.toConsumerComponent(versionNum, this.scope, repo);
      })
    );
  }

  /**
   * if exactVersion is defined, add exact version instead of using the semver mechanism
   */
  addVersion(version: Version, releaseType: string = DEFAULT_BIT_RELEASE_TYPE, exactVersion: ?string): string {
    if (exactVersion && this.versions[exactVersion]) {
      throw new VersionAlreadyExists(exactVersion, this.id());
    }
    const versionToAdd = exactVersion || this.version(releaseType);
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
    return this.scope ? [this.scope, this.box, this.name].join('/') : [this.box, this.name].join('/');
  }

  toBitId(): BitId {
    return new BitId({ scope: this.scope, box: this.box, name: this.name });
  }

  toObject() {
    function versions(vers: { [string]: Ref }) {
      const obj = {};
      forEach(vers, (ref, version) => {
        obj[version] = ref.toString();
      });
      return obj;
    }

    const componentObject = {
      box: this.box,
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
    if (!versionRef) throw new VersionNotFound();
    return versionRef.load(repository);
  }

  loadVersionSync(version: number, repository: Repository, throws: boolean = true): Version {
    const versionRef: Ref = this.versions[version];
    if (!versionRef) throw new VersionNotFound();
    return versionRef.loadSync(repository, throws);
  }

  collectObjects(repo: Repository): Promise<ComponentObjects> {
    return Promise.all([this.asRaw(repo), this.collectRaw(repo)]).then(
      ([rawComponent, objects]) => new ComponentObjects(rawComponent, objects)
    );
  }

  /**
   *
   *
   * @param {Repository} repo
   * @param {boolean} [deepRemove=false] - wether to remove all the refs or only the version array
   * @returns {Promise}
   * @memberof Component
   */
  remove(repo: Repository, deepRemove: boolean = false): Promise {
    logger.debug(`removing a component ${this.id()} from a local scope`);
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
      throw new Error(`the version ${versionNum} does not exist in ${this.listVersions().join('\n')}, versions array`);
    }
    return new ComponentVersion(this, versionNum);
  }

  toConsumerComponent(versionStr: string, scopeName: string, repository: Repository) {
    const componentVersion = this.toComponentVersion(versionStr);
    return componentVersion.getVersion(repository).then((version: Version) => {
      const filesP = version.files
        ? Promise.all(
          version.files.map(file =>
            file.file
              .load(repository)
              .then(
                content =>
                  new SourceFile({ base: '.', path: file.relativePath, contents: content.contents, test: file.test })
              )
          )
        )
        : null;
      const distsP = version.dists
        ? Promise.all(
          version.dists.map(dist =>
            dist.file.load(repository).then((content) => {
              return new Dist({ base: '.', path: dist.relativePath, contents: content.contents, test: dist.test });
            })
          )
        )
        : null;
      const scopeMetaP = scopeName ? ScopeMeta.fromScopeName(scopeName).load(repository) : Promise.resolve();
      const log = version.log || null;
      return Promise.all([filesP, distsP, scopeMetaP]).then(([files, dists, scopeMeta]) => {
        // when generating a new ConsumerComponent out of Version, it is critical to make sure that
        // all objects are cloned and not copied by reference. Otherwise, every time the
        // ConsumerComponent instance is changed, the Version will be changed as well, and since
        // the Version instance is saved in the Repository._cache, the next time a Version instance
        // is retrieved, it'll be different than the first time.
        return new ConsumerComponent({
          name: this.name,
          box: this.box,
          version: componentVersion.version,
          scope: this.scope,
          lang: this.lang,
          bindingPrefix: this.bindingPrefix,
          mainFile: version.mainFile || null,
          compilerId: version.compiler,
          testerId: version.tester,
          dependencies: version.dependencies.getClone(),
          devDependencies: version.devDependencies.getClone(),
          flattenedDependencies: BitIds.clone(version.flattenedDependencies),
          flattenedDevDependencies: BitIds.clone(version.flattenedDevDependencies),
          packageDependencies: clone(version.packageDependencies),
          devPackageDependencies: clone(version.devPackageDependencies),
          peerPackageDependencies: clone(version.peerPackageDependencies),
          files,
          dists,
          docs: version.docs,
          license: scopeMeta ? License.deserialize(scopeMeta.license) : null, // todo: make sure we have license in case of local scope
          specsResults: version.specsResults ? version.specsResults.map(res => SpecsResults.deserialize(res)) : null,
          log,
          deprecated: this.deprecated
        });
      });
    });
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

  toBuffer(pretty: boolean) {
    const args = getStringifyArgs(pretty);
    return new Buffer(JSON.stringify(this.toObject(), ...args));
  }

  toVersionDependencies(version: string, scope: Scope, source: string, withDevDependencies?: boolean) {
    const versionComp = this.toComponentVersion(version);
    return versionComp.toVersionDependencies(scope, source, withDevDependencies);
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
      name: rawComponent.name,
      box: rawComponent.box,
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
    return new Component({
      name: bitId.name,
      box: bitId.box,
      scope: bitId.scope
    });
  }
}
