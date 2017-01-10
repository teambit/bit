/** @flow */
import { Ref, BitObject } from '../objects';
import { VersionNotFound } from '../exceptions';
import { forEach, empty } from '../../utils';
import Version from './version';
import { DEFAULT_BOX_NAME } from '../../constants';
import BitId from '../../bit-id/bit-id';
import VersionParser from '../../version';
import ConsumerComponent from '../../consumer/bit-component';
import Repository from '../objects/repository';
import { Impl, Specs } from '../../consumer/bit-component/sources';

export type ComponentProps = {
  box?: string;
  name: string;
  versions?: {[number]: Ref};
};

export default class Component extends BitObject {
  name: string;
  box: string;
  versions: {[number]: Ref};

  constructor(props: ComponentProps) {
    super();
    this.name = props.name;
    this.box = props.box || DEFAULT_BOX_NAME;
    this.versions = props.versions || {};
  }

  latest(): number {
    if (empty(this.versions)) return 0;
    return Math.max(...this.listVersions());
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
    return [this.box, this.name].join('/');   
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
      versions: versions(this.versions)
    };
  }

  listVersions(): number[] {
    return Object.keys(this.versions).map(parseInt);
  }

  loadVersion(version: number, repository: Repository): Promise<Version> {
    const versionRef = this.versions[version];
    if (!versionRef) throw new VersionNotFound();
    return versionRef.load(repository);
  }

  toId() {
    return new BitId();
  }

  toConsumerComponent(versionStr: string, repository: Repository) {
    const versionNum = VersionParser
      .parse(versionStr)
      .resolve(this.listVersions());

    this.loadVersion(versionNum, repository)
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
            scope: '',
            version: versionNum,
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

  toBuffer() {
    return new Buffer(JSON.stringify(this.toObject()));
  }

  static parse(contents: string): Component {
    return new Component(JSON.parse(contents));
  }

  static from(props: ComponentProps): Component {
    return new Component(props);
  }

  static fromBitId(bitId: BitId): Component {
    return new Component({ name: bitId.name, box: bitId.box });
  }
}
