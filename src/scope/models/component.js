/** @flow */
import { Ref, BitObject } from '../../objects';
import { forEach } from '../../utils';

export type ComponentProps = {
  box: string;
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
    this.box = props.box;
    this.versions = props.versions || {};
  }

  latest() {
    return Math.max(...Object.keys(this.versions)
      .map(parseInt)
    );
  }

  id() {
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
      version: versions(this.versions)
    };
  }

  toBuffer() {
    return new Buffer(JSON.stringify(this.toObject()));
  }

  static parse(contents: string): Component {
    return new Component(JSON.parse(contents));
  }
}
