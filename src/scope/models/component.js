/** @flow */
import { equals, zip, fromPairs, keys, mapObjIndexed, objOf, mergeWith, merge, map, prop } from 'ramda';
import { Ref, BitObject } from '../objects';
import { VersionNotFound } from '../exceptions';
import { forEach, empty, mapObject, values } from '../../utils';
import Version from './version';
import { DEFAULT_BOX_NAME } from '../../constants';
import BitId from '../../bit-id/bit-id';
import VersionParser from '../../version';
import ConsumerComponent from '../../consumer/component';
import Scope from '../scope';
import Repository from '../objects/repository';
import ComponentVersion from '../component-version';
import { Impl, Specs } from '../../consumer/component/sources';
import ComponentObjects from '../component-objects';

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

  compare(component: Component) {
    return equals(component.versions, this.versions);
  }

  latest(): number {
    if (empty(this.versions)) return 0;
    return Math.max(...this.listVersions());
  }
  
  collectVersions(repo: Repository):
  Promise<{[number]: {message: string, date: string, hash: string}}> {
    return repo.findMany(this.versionArray)
    .then((versions) => {
      const indexedLogs = fromPairs(zip(keys(this.versions), map(prop('log'), versions)));
      const indexedHashes = mapObjIndexed(ref => objOf('hash', ref.toString()), this.versions);
      return mergeWith(merge, indexedLogs, indexedHashes);
    });
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

  listVersions(): number[] {
    return Object.keys(this.versions).map(versionStr => parseInt(versionStr));
  }

  loadVersion(version: number, repository: Repository): Promise<Version> {
    const versionRef = this.versions[version];
    if (!versionRef) throw new VersionNotFound();
    return versionRef.load(repository);
  }

  collectObjects(repo: Repository) {
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

    if (!this.versions[versionNum]) throw new Error();
    return new ComponentVersion(this, versionNum, scopeName);
  }

  toConsumerComponent(versionStr: string, scopeName: string, repository: Repository) {
    const versionNum = VersionParser
      .parse(versionStr)
      .resolve(this.listVersions());

    return this.loadVersion(versionNum, repository)
      .then((version) => {
        const implP = version.impl.file.load(repository);
        const specsP = version.specs ? version.specs.file.load(repository) : null;
        const compilerP = version.compiler ? version.compiler.load(repository) : null;
        const testerP = version.tester ? version.tester.load(repository): null;
        return Promise.all([implP, specsP, compilerP, testerP])
        .then(([impl, specs, compiler, tester]) => {
          return new ConsumerComponent({
            name: this.name,
            box: this.box,
            version: versionNum,
            scope: this.scope,
            implFile: version.impl.name,
            specsFile: version.specs ? version.specs.name : null,
            compilerId: compiler ? compiler.toId() : null,
            testerId: tester ? tester.toId() : null,
            packageDependencies: version.packageDependencies,
            impl: new Impl(impl.toString()),
            specs: specs ? new Specs(specs.toString()): null
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

  toVersionDependencies(version: string, scope: Scope) {
    const versionComp = this.toComponentVersion(version, scope.name());
    return versionComp.toVersionDependencies(scope);
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
      scope: bitId.getScopeWithoutRemoteAnnotaion()
    });
  }
}
