/** @flow */
import { BitObject } from '../objects';
import { DEFAULT_BOX_NAME } from '../../constants';
import { getStringifyArgs } from '../../utils';


export type SymlinkProp = {
  scope: string;
  box?: string;
  name: string;
  realScope: string;
};

export default class Symlink extends BitObject {
  scope: string;
  name: string;
  box: string;
  realScope: string;

  constructor(props: SymlinkProp) {
    super();
    this.scope = props.scope;
    this.name = props.name;
    this.box = props.box || DEFAULT_BOX_NAME;
    this.realScope = props.realScope;
  }

  id(): string {
    return [this.box, this.name].join('/');
  }

  getRealComponentId() {
    return [this.realScope, this.box, this.name].join('/');
  }

  static parse(contents: string): Symlink {
    const rawContent = JSON.parse(contents);
    return Symlink.from(rawContent);
  }

  toObject() {
    return {
      scope: this.scope,
      box: this.box,
      name: this.name,
      realScope: this.realScope
    };
  }

  toBuffer(pretty: boolean) {
    const args = getStringifyArgs(pretty);
    return new Buffer(JSON.stringify(this.toObject(), ...args));
  }

  static from(props: SymlinkProp) {
    return new Symlink(props);
  }
}
