/** @flow */
import { equals, zip, fromPairs, keys, mapObjIndexed, objOf, mergeWith, merge, map, prop } from 'ramda';
import { Ref, BitObject } from '../objects';
import { ScopeMeta } from '../models';
import { VersionNotFound } from '../exceptions';
import { forEach, empty, mapObject, values, diff, filterObject } from '../../utils';
import Version from './version';
import { DEFAULT_BOX_NAME } from '../../constants';
import BitId from '../../bit-id/bit-id';
import VersionParser from '../../version';
import ConsumerComponent from '../../consumer/component';
import Scope from '../scope';
import Repository from '../objects/repository';
import ComponentVersion from '../component-version';
import { Impl, Specs, Dist, License } from '../../consumer/component/sources';
import ComponentObjects from '../component-objects';
import SpecsResults from '../../consumer/specs-results';

export type ComponentProps = {
  scope: string;
  box?: string;
  name: string;
  versions?: {[number]: Ref};
};

export default class Component extends BitObject {
  scope: string;
  name: string;
  box: string;
  versions: {[number]: Ref};

  constructor(props: ComponentProps) {
    super();
    this.scope = props.scope;
    this.name = props.name;
    this.box = props.box || DEFAULT_BOX_NAME;
    this.versions = props.versions || {};
  }

  get versionArray(): Ref[] {
    return values(this.versions);
  }

  listVersions(): number[] {
    return Object.keys(this.versions).map(versionStr => parseInt(versionStr));
  }

  compatibleWith(component: Component) {
    const differnece = diff(
      Object.keys(this.versions),
      Object.keys(component.versions
    ));
    const comparableObject = filterObject(this.versions, (val, key) => !differnece.includes(key));
    return equals(component.versions, comparableObject);
  }

  latest(): number {
    if (empty(this.versions)) return 0;
    return Math.max(...this.listVersions());
  }

  collectLogs(repo: Repository):
  Promise<{[number]: {message: string, date: string, hash: string}}> {
    return repo.findMany(this.versionArray)
    .then((versions) => {
      const indexedLogs = fromPairs(zip(keys(this.versions), map(prop('log'), versions)));
      const indexedHashes = mapObjIndexed(ref => objOf('hash', ref.toString()), this.versions);
      return mergeWith(merge, indexedLogs, indexedHashes);
    });
  }

  collectVersions(repo: Repository): Promise<ConsumerComponent> {
    return Promise.all(
      this.listVersions()
      .map((versionNum) => {
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
    return [this.scope, this.box, this.name].join('/');
  }

  toObject() {
    function versions(vers: {[number]: Ref}) {
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
      versions: versions(this.versions)
    };
  }

  loadVersion(version: number, repository: Repository): Promise<Version> {
    const versionRef = this.versions[version];
    if (!versionRef) throw new VersionNotFound();
    return versionRef.load(repository);
  }

  collectObjects(repo: Repository): Promise<ComponentObjects> {
    return Promise.all([this.asRaw(repo), this.collectRaw(repo)])
      .then(([rawComponent, objects]) => new ComponentObjects(
        rawComponent,
        objects
      ));
  }

  remove(repo: Repository) {
    const objectRefs = this.versionArray;
    return repo.removeMany(objectRefs.concat([this.hash()]));
  }

  toComponentVersion(versionStr: string, scopeName: string): ComponentVersion {
    const versionNum = VersionParser
      .parse(versionStr)
      .resolve(this.listVersions());

    if (!this.versions[versionNum]) throw new Error(`the version ${versionNum} does not exist in ${this.listVersions().join('\n')}, versions array`);
    return new ComponentVersion(this, versionNum, scopeName);
  }

  toConsumerComponent(versionStr: string, scopeName: string, repository: Repository) {
    const componentVersion = this.toComponentVersion(versionStr, scopeName);
    return componentVersion
      .getVersion(repository)
        .then((version) => {
          const implP = version.impl.file.load(repository);
          const specsP = version.specs ? version.specs.file.load(repository) : null;
          const distP = version.dist ? version.dist.file.load(repository) : null;
          const scopeMetaP = ScopeMeta.fromScopeName(scopeName).load(repository);
          return Promise.all([implP, specsP, distP, scopeMetaP])
          .then(([impl, specs, dist, scopeMeta]) => {
            return new ConsumerComponent({
              name: this.name,
              box: this.box,
              version: componentVersion.version,
              scope: this.scope,
              implFile: version.impl.name,
              specsFile: version.specs ? version.specs.name : null,
              compilerId: version.compiler,
              testerId: version.tester,
              dependencies: version.dependencies,
              packageDependencies: version.packageDependencies,
              impl: new Impl(impl.toString()),
              specs: specs ? new Specs(specs.toString()) : null,
              docs: version.docs,
              dist: dist ? Dist.fromString(dist.toString()) : null,
              license: scopeMeta ? License.deserialize(scopeMeta.license) : null,
              specsResults:
                version.specsResults ? SpecsResults.deserialize(version.specsResults) : null,
            });
          });
        });
  }

  refs(): Ref[] {
    return values(this.versions);
  }

  toBuffer() {
    return new Buffer(JSON.stringify(this.toObject()));
  }

  toVersionDependencies(version: string, scope: Scope, source: string, withDevDependencies?: bool) {
    const versionComp = this.toComponentVersion(version, scope.name);
    return versionComp.toVersionDependencies(scope, source, withDevDependencies);
  }

  static parse(contents: string): Component {
    const rawComponent = JSON.parse(contents);
    return Component.from({
      name: rawComponent.name,
      box: rawComponent.box,
      scope: rawComponent.scope,
      versions: mapObject(rawComponent.versions, val => Ref.from(val))
    });
  }

  static from(props: ComponentProps): Component {
    return new Component(props);
  }

  static fromBitId(bitId: BitId): Component {
    return new Component({
      name: bitId.name,
      box: bitId.box,
      scope: bitId.getScopeWithoutRemoteAnnotation()
    });
  }
}
