/** @flow */
import { is, equals, zip, fromPairs, keys, mapObjIndexed, objOf, mergeWith, merge, map, prop } from 'ramda';
import path from 'path';
import { Ref, BitObject } from '../objects';
import { ScopeMeta } from '../models';
import { VersionNotFound, CorruptedComponent } from '../exceptions';
import { forEach, empty, mapObject, values, diff, filterObject, getStringifyArgs } from '../../utils';
import Version from './version';
import { DEFAULT_BOX_NAME, DEFAULT_LANGUAGE, DEFAULT_DIST_DIRNAME, DEFAULT_LINK_NAME } from '../../constants';
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
  versions?: { [number]: Ref },
  lang?: string,
  deprecated: boolean,
  bindingPrefix?: string
};

export default class Component extends BitObject {
  scope: string;
  name: string;
  box: string;
  versions: { [number]: Ref };
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
    this.bindingPrefix = props.bindingPrefix || DEFAULT_LINK_NAME;
  }

  get versionArray(): Ref[] {
    return values(this.versions);
  }

  listVersions(): number[] {
    return Object.keys(this.versions).map(versionStr => parseInt(versionStr));
  }

  compatibleWith(component: Component) {
    const differnece = diff(Object.keys(this.versions), Object.keys(component.versions));

    const comparableObject = filterObject(this.versions, (val, key) => !differnece.includes(key));
    return equals(component.versions, comparableObject);
  }

  latest(): number {
    if (empty(this.versions)) return 0;
    return Math.max(...this.listVersions());
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
        return this.toConsumerComponent(String(versionNum), this.scope, repo);
      })
    );
  }

  addVersion(version: Version) {
    this.versions[this.version()] = version.hash();
    return this;
  }

  version() {
    const latest = this.latest();
    if (latest) return latest + 1;
    return 1;
  }

  id(): string {
    return this.scope ? [this.scope, this.box, this.name].join('/') : [this.box, this.name].join('/');
  }

  toObject() {
    function versions(vers: { [number]: Ref }) {
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

  async loadVersion(version: number, repository: Repository): Promise<Version> {
    const versionRef: Ref = this.versions[version];
    if (!versionRef) throw new VersionNotFound();
    const versionLoaded = await versionRef.load(repository);
    if (!versionLoaded) {
      logger.error(`loadVersion, failed loading version ${version} of ${this.id()}`);
      throw new CorruptedComponent(this.id(), version);
    }
    return versionLoaded;
  }

  collectObjects(repo: Repository): Promise<ComponentObjects> {
    return Promise.all([this.asRaw(repo), this.collectRaw(repo)]).then(
      ([rawComponent, objects]) => new ComponentObjects(rawComponent, objects)
    );
  }

  remove(repo: Repository): Promise {
    const objectRefs = this.versionArray;
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
