/** @flow */
import semver from 'semver';
import { is, equals, zip, fromPairs, keys, mapObjIndexed, objOf, mergeWith, merge, map, prop } from 'ramda';
import path from 'path';
import { Ref, BitObject } from '../objects';
import { ScopeMeta } from '../models';
import { VersionNotFound, VersionAlreadyExists } from '../exceptions';
import { forEach, empty, mapObject, values, diff, filterObject, getStringifyArgs } from '../../utils';
import Version from './version';
import {
  DEFAULT_BOX_NAME,
  DEFAULT_LANGUAGE,
  DEFAULT_DIST_DIRNAME,
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

export type ComponentProps = {
  scope?: string,
  box?: string,
  name: string,
  versions?: { [string]: Ref },
  lang?: string,
  deprecated: boolean,
  bindingPrefix?: string
};

export default class Component extends BitObject {
  scope: string;
  name: string;
  box: string;
  versions: { [string]: Ref };
  lang: string;
  deprecated: boolean;
  bindingPrefix: string;

  constructor(props: ComponentProps) {
    super();
    this.scope = props.scope || null;
    this.name = props.name;
    this.box = props.box || DEFAULT_BOX_NAME;
    this.versions = props.versions || {};
    this.lang = props.lang || DEFAULT_LANGUAGE;
    this.deprecated = props.deprecated || false;
    this.bindingPrefix = props.bindingPrefix || DEFAULT_BINDINGS_PREFIX;
  }

  get versionArray(): Ref[] {
    return values(this.versions);
  }

  listVersions(): string[] {
    return Object.keys(this.versions);
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

  collectLogs(repo: Repository): Promise<{ [number]: { message: string, date: string, hash: string } }> {
    return repo.findMany(this.versionArray).then((versions) => {
      const indexedLogs = fromPairs(zip(keys(this.versions), map(prop('log'), versions)));
      const indexedHashes = mapObjIndexed(ref => objOf('hash', ref.toString()), this.versions);
      return mergeWith(merge, indexedLogs, indexedHashes);
    });
  }

  collectVersions(repo: Repository): Promise<ConsumerComponent> {
    return Promise.all(
      this.listVersions().map((versionNum) => {
        return this.toConsumerComponent(versionNum, this.scope, repo);
      })
    );
  }

  addVersion(version: Version, releaseType: string = DEFAULT_BIT_RELEASE_TYPE, exactVersion: ?string) {
    // Add exact version instead of using the semver mechanism
    if (exactVersion) {
      // Version already exists
      if (this.versions[exactVersion]) throw new VersionAlreadyExists(exactVersion, this.id());
      this.versions[exactVersion] = version.hash();
      return this;
    }
    this.versions[this.version(releaseType)] = version.hash();
    return this;
  }

  version(releaseType: string = DEFAULT_BIT_RELEASE_TYPE) {
    const latest = this.latest();
    if (latest) return semver.inc(latest, releaseType);
    return DEFAULT_BIT_VERSION;
  }

  id(): string {
    return this.scope ? [this.scope, this.box, this.name].join('/') : [this.box, this.name].join('/');
  }

  toObject() {
    function versions(vers: { [string]: Ref }) {
      const obj = {};
      forEach(vers, (ref, version) => {
        obj[version] = ref.toString();
      });
      return obj;
    }

    return {
      box: this.box,
      name: this.name,
      scope: this.scope,
      versions: versions(this.versions),
      lang: this.lang,
      deprecated: this.deprecated,
      bindingPrefix: this.bindingPrefix
    };
  }

  async loadVersion(version: string, repository: Repository): Promise<Version> {
    const versionRef: Ref = this.versions[version];
    if (!versionRef) throw new VersionNotFound();
    return versionRef.load(repository);
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
    const objectRefs = deepRemove ? this.collectRefs(repo) : this.versionArray;
    return repo.removeMany(objectRefs.concat([this.hash()]));
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
    return componentVersion.getVersion(repository).then((version) => {
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
              const relativePathWithDist = path.join(DEFAULT_DIST_DIRNAME, dist.relativePath);
              return new Dist({ base: '.', path: relativePathWithDist, contents: content.contents, test: dist.test });
            })
          )
        )
        : null;
      const scopeMetaP = scopeName ? ScopeMeta.fromScopeName(scopeName).load(repository) : Promise.resolve();
      const log = version.log || null;
      return Promise.all([filesP, distsP, scopeMetaP]).then(([files, dists, scopeMeta]) => {
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
          dependencies: version.dependencies // todo: understand why sometimes the dependencies are not parsed
            .map(dependency => ({
              id: is(String, dependency.id) ? BitId.parse(dependency.id) : dependency.id,
              // After the || is backward compatibility stuff
              relativePaths: dependency.relativePaths || [
                { sourceRelativePath: dependency.relativePath, destinationRelativePath: dependency.relativePath }
              ]
            })),
          flattenedDependencies: version.flattenedDependencies,
          packageDependencies: version.packageDependencies,
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

  toBuffer(pretty: boolean) {
    const args = getStringifyArgs(pretty);
    return new Buffer(JSON.stringify(this.toObject(), ...args));
  }

  toVersionDependencies(version: string, scope: Scope, source: string, withDevDependencies?: boolean) {
    const versionComp = this.toComponentVersion(version);
    return versionComp.toVersionDependencies(scope, source, withDevDependencies);
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
      bindingPrefix: rawComponent.bindingPrefix
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
