/** @flow */
import { Ref, BitObject } from '../objects';
import { forEach, empty } from '../../utils';
import Version from './version';

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
    this.box = props.box || 'global';
    this.versions = props.versions || {};
  }

  latest(): number {
    if (empty(this.versions)) return 0;
    return Math.max(...Object.keys(this.versions)
      .map(parseInt)
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

  toBuffer() {
    return new Buffer(JSON.stringify(this.toObject()));
  }

  static parse(contents: string): Component {
    return new Component(JSON.parse(contents));
  }
}
